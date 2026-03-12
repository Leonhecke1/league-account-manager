import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  riotId: string;
  login?: string;
  notes?: string;
  region: string; // platform slug: euw1 | na1 | kr | …
}

interface Champion {
  name: string;
  points: number;
  level: number;
}

interface AccountData {
  ingameName: string;
  level: number;
  soloTier: string;
  soloRank: string;
  soloLp: number;
  soloWins: number;
  soloLosses: number;
  flexTier: string;
  flexRank: string;
  flexLp: number;
  flexWins: number;
  flexLosses: number;
  topChampions: Champion[]; // sorted by mastery points, top 100
  lastUpdated: string;
}

interface Settings {
  apiKey: string;
  apiEnabled: boolean;
  region: { account: string; platform: string };
}

// ── File paths (stored in OS user-data folder) ────────────────────────────────

const USER_DATA    = app.getPath("userData");
const ACCOUNTS_FILE = join(USER_DATA, "accounts.json");
const CACHE_FILE    = join(USER_DATA, "cache.json");
const SETTINGS_FILE = join(USER_DATA, "settings.json");

function readJson<T>(path: string, fallback: T): T {
  try {
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf-8")) as T)
      : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

// ── Riot API ──────────────────────────────────────────────────────────────────

const ROUTING_MAP: Record<string, string> = {
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe",
  na1: "americas", br1: "americas", la1: "americas", la2: "americas", oc1: "americas",
  kr: "asia", jp1: "asia", sg2: "asia",
};

async function riotFetch<T>(url: string, apiKey: string): Promise<T | null> {
  for (let i = 0; i < 3; i++) {
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}api_key=${apiKey}`);

    if (res.ok) return res.json() as Promise<T>;

    if (res.status === 429) {
      const wait = parseInt(res.headers.get("Retry-After") ?? "2", 10);
      await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
      continue;
    }
    if (res.status === 404) return null;
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} from ${url} — ${body}`);
    }
    return null;
  }
  return null;
}

// Champion map from Data Dragon (cached in memory for the session)
let _champMap = new Map<number, string>();
let _ddVersion = "";

async function getChampMap(): Promise<Map<number, string>> {
  if (_champMap.size > 0) return _champMap;

  const versions: string[] = await (
    await fetch("https://ddragon.leagueoflegends.com/api/versions.json")
  ).json();

  if (_ddVersion === versions[0]) return _champMap;
  _ddVersion = versions[0];

  const json: { data: Record<string, { key: string; name: string }> } = await (
    await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`
    )
  ).json();

  _champMap = new Map();
  for (const c of Object.values(json.data)) {
    _champMap.set(parseInt(c.key, 10), c.name);
  }
  return _champMap;
}

async function fetchAccountData(
  riotId: string,
  platform: string,
  apiKey: string
): Promise<AccountData> {
  const [gameName, tagLine] = riotId.split("#").map((s) => s.trim());
  if (!gameName || !tagLine) throw new Error("Invalid Riot ID — use GameName#Tag");
  const routing = ROUTING_MAP[platform] ?? "europe";

  type AccDto  = { puuid: string; gameName: string };
  type SumDto  = { summonerLevel: number };
  type LeaDto  = { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number };
  type MasDto  = { championId: number; championPoints: number; championLevel: number };

  // 1. PUUID
  const account = await riotFetch<AccDto>(
    `https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    apiKey
  );
  if (!account) throw new Error(`Account not found: ${riotId}`);

  // 2. Summoner
  const summoner = await riotFetch<SumDto>(
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,
    apiKey
  );
  if (!summoner) throw new Error(`Summoner not found for: ${riotId}`);

  // 3. Ranked + Mastery + DataDragon in parallel
  const [entries, masteries, cMap] = await Promise.all([
    riotFetch<LeaDto[]>(
      `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
      apiKey
    ),
    riotFetch<MasDto[]>(
      `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${account.puuid}`,
      apiKey
    ),
    getChampMap(),
  ]);

  const solo = entries?.find((e) => e.queueType === "RANKED_SOLO_5x5");
  const flex = entries?.find((e) => e.queueType === "RANKED_FLEX_SR");

  return {
    ingameName: account.gameName,
    level:      summoner.summonerLevel,
    soloTier:   solo?.tier          ?? "UNRANKED",
    soloRank:   solo?.rank          ?? "",
    soloLp:     solo?.leaguePoints  ?? 0,
    soloWins:   solo?.wins          ?? 0,
    soloLosses: solo?.losses        ?? 0,
    flexTier:   flex?.tier          ?? "UNRANKED",
    flexRank:   flex?.rank          ?? "",
    flexLp:     flex?.leaguePoints  ?? 0,
    flexWins:   flex?.wins          ?? 0,
    flexLosses: flex?.losses        ?? 0,
    topChampions: (masteries ?? [])
      .filter((m) => m.championPoints > 0)
      .slice(0, 100)
      .map((m) => ({
        name:   cMap.get(m.championId) ?? `ID:${m.championId}`,
        points: m.championPoints,
        level:  m.championLevel,
      })),
    lastUpdated: new Date().toISOString(),
  };
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1340,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#010a13",
    show: false,
    webPreferences: {
      preload:          join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // electron-vite injects ELECTRON_RENDERER_URL in dev mode
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// Accounts
ipcMain.handle("accounts:get", () => {
  const { accounts } = readJson<{ accounts: Account[] }>(ACCOUNTS_FILE, { accounts: [] });
  return accounts;
});

ipcMain.handle("accounts:add", (_e, account: Omit<Account, "id">) => {
  const store = readJson<{ accounts: Account[] }>(ACCOUNTS_FILE, { accounts: [] });
  const newAcc: Account = { id: randomUUID(), ...account };
  store.accounts.push(newAcc);
  writeJson(ACCOUNTS_FILE, store);
  return newAcc;
});

ipcMain.handle("accounts:update", (_e, id: string, patch: Partial<Omit<Account, "id">>) => {
  const store = readJson<{ accounts: Account[] }>(ACCOUNTS_FILE, { accounts: [] });
  store.accounts = store.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a));
  writeJson(ACCOUNTS_FILE, store);
});

ipcMain.handle("accounts:remove", (_e, id: string) => {
  const store = readJson<{ accounts: Account[] }>(ACCOUNTS_FILE, { accounts: [] });
  store.accounts = store.accounts.filter((a) => a.id !== id);
  writeJson(ACCOUNTS_FILE, store);

  const cache = readJson<Record<string, AccountData>>(CACHE_FILE, {});
  delete cache[id];
  writeJson(CACHE_FILE, cache);
});

// Riot API fetch
ipcMain.handle("riot:fetch", async (_e, id: string, riotId: string, platform: string) => {
  const settings = readJson<Settings>(SETTINGS_FILE, {
    apiKey: "",
    apiEnabled: true,
    region: { account: "europe", platform: "euw1" },
  });
  const apiKey = settings.apiKey.trim();
  if (!apiKey.startsWith("RGAPI-")) {
    return { error: "No valid API key. Open Settings and add your RGAPI key." };
  }
  try {
    const data = await fetchAccountData(riotId, platform, apiKey);
    const cache = readJson<Record<string, AccountData>>(CACHE_FILE, {});
    cache[id] = data;
    writeJson(CACHE_FILE, cache);
    return data;
  } catch (err) {
    return { error: (err as Error).message };
  }
});

// Cache
ipcMain.handle("cache:get", () => {
  return readJson<Record<string, AccountData>>(CACHE_FILE, {});
});

ipcMain.handle("cache:set", (_e, id: string, data: AccountData) => {
  const cache = readJson<Record<string, AccountData>>(CACHE_FILE, {});
  cache[id] = data;
  writeJson(CACHE_FILE, cache);
});

// Settings
ipcMain.handle("settings:get", () => {
  return readJson<Settings>(SETTINGS_FILE, {
    apiKey: "",
    apiEnabled: true,
    region: { account: "europe", platform: "euw1" },
  });
});

ipcMain.handle("settings:save", (_e, settings: Settings) => {
  writeJson(SETTINGS_FILE, { ...settings, apiKey: settings.apiKey.trim() });
});
