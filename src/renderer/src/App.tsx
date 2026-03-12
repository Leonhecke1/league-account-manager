import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  RefreshCw, Plus, Trash2, Settings, Search, Shield,
  X, Eye, EyeOff, AlertTriangle, ChevronUp, ChevronDown, Pencil,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  riotId: string;
  login?: string;
  notes?: string;
  region: string;
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
  topChampions: Champion[];
  lastUpdated: string;
}

interface AppSettings {
  apiKey: string;
  apiEnabled: boolean;
  region: { account: string; platform: string };
}

// ── Electron bridge type ───────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI: {
      getAccounts:      ()                                              => Promise<Account[]>;
      addAccount:       (a: Omit<Account, "id">)                       => Promise<Account>;
      updateAccount:    (id: string, patch: Partial<Omit<Account,"id">>) => Promise<void>;
      removeAccount:    (id: string)                                   => Promise<void>;
      fetchAccountData: (id: string, riotId: string, p: string)       => Promise<AccountData | { error: string }>;
      getCache:         ()                                              => Promise<Record<string, AccountData>>;
      setCache:         (id: string, data: AccountData)                => Promise<void>;
      getSettings:      ()                                              => Promise<AppSettings>;
      saveSettings:     (s: Partial<AppSettings>)                      => Promise<void>;
    };
  }
}

// ── Rank helpers ───────────────────────────────────────────────────────────────

const TIERS = [
  "UNRANKED","IRON","BRONZE","SILVER","GOLD",
  "PLATINUM","EMERALD","DIAMOND","MASTER","GRANDMASTER","CHALLENGER",
];
const RANKS = ["","I","II","III","IV"];
const HIGH_TIERS = new Set(["MASTER","GRANDMASTER","CHALLENGER","UNRANKED"]);

const TIER_VALUE: Record<string, number> = {
  CHALLENGER: 9000, GRANDMASTER: 8000, MASTER: 7000,
  DIAMOND:    6000, EMERALD:     5000, PLATINUM: 4000,
  GOLD:       3000, SILVER:      2000, BRONZE:   1000, IRON: 0,
};
const RANK_VALUE: Record<string, number> = { I: 400, II: 300, III: 200, IV: 100 };

function rankWeight(tier?: string, rank?: string, lp?: number): number {
  return (TIER_VALUE[tier ?? ""] ?? -1) + (RANK_VALUE[rank ?? ""] ?? 0) + (lp ?? 0);
}

const TIER_COLORS: Record<string, string> = {
  CHALLENGER:   "#f4c874",
  GRANDMASTER:  "#e84057",
  MASTER:       "#9d48e0",
  DIAMOND:      "#576bce",
  EMERALD:      "#52c469",
  PLATINUM:     "#4a9e8e",
  GOLD:         "#c89b3c",
  SILVER:       "#7b8fa5",
  BRONZE:       "#a06533",
  IRON:         "#685c52",
};

// ── Region helpers ─────────────────────────────────────────────────────────────

const REGIONS: { label: string; platform: string; account: string }[] = [
  { label: "EUW — Europe West",           platform: "euw1", account: "europe"   },
  { label: "EUNE — Europe Nordic & East", platform: "eun1", account: "europe"   },
  { label: "NA — North America",          platform: "na1",  account: "americas" },
  { label: "KR — Korea",                  platform: "kr",   account: "asia"     },
  { label: "BR — Brazil",                 platform: "br1",  account: "americas" },
  { label: "LAN — Latin America North",   platform: "la1",  account: "americas" },
  { label: "LAS — Latin America South",   platform: "la2",  account: "americas" },
  { label: "OCE — Oceania",               platform: "oc1",  account: "americas" },
  { label: "TR — Turkey",                 platform: "tr1",  account: "europe"   },
  { label: "RU — Russia",                 platform: "ru",   account: "europe"   },
  { label: "JP — Japan",                  platform: "jp1",  account: "asia"     },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function RankBadge({
  tier, rank, lp, wins, losses,
}: { tier: string; rank: string; lp: number; wins: number; losses: number }) {
  if (!tier || tier === "UNRANKED") {
    return <span className="text-hex-text-dim text-xs">Unranked</span>;
  }
  const color = TIER_COLORS[tier] ?? "#a9b4c8";
  const total = wins + losses;
  const wr = total > 0 ? ((wins / total) * 100).toFixed(1) : null;
  const tierName = tier.charAt(0) + tier.slice(1).toLowerCase();

  return (
    <div className="space-y-0.5">
      <div className="font-semibold text-sm leading-none" style={{ color }}>
        {tierName} {rank}
      </div>
      <div className="text-xs text-hex-text-dim">{lp} LP</div>
      {wr && (
        <div className="text-xs text-hex-text-dim">
          {wins}W / {losses}L · {wr}%
        </div>
      )}
    </div>
  );
}

function LevelBadge({ level }: { level: number }) {
  const pct = Math.min((level / 500) * 100, 100);
  return (
    <div className="w-14">
      <div className="font-bold text-hex-gold text-sm">{level}</div>
      <div className="w-full bg-hex-border rounded-full h-0.5 mt-1">
        <div
          className="bg-hex-gold h-0.5 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ChampionCell({ champ }: { champ: Champion | null | undefined }) {
  if (!champ) return <span className="text-hex-text-dim text-xs">—</span>;
  const pts = champ.points >= 1_000_000
    ? (champ.points / 1_000_000).toFixed(1) + "M"
    : Math.floor(champ.points / 1_000) + "k";
  return (
    <div className="space-y-0.5">
      <div className="font-medium text-hex-text text-sm">{champ.name}</div>
      <div className="text-xs text-hex-text-dim">
        M{champ.level} · {pts} pts
      </div>
    </div>
  );
}

function Toast({ message, type }: { message: string; type: "error" | "info" }) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 rounded text-sm shadow-lg ${
        type === "error"
          ? "bg-red-900/80 border border-red-700 text-red-200"
          : "bg-hex-dark border border-hex-border text-hex-text"
      }`}
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────

function Modal({
  title, onClose, children, wide,
}: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 overflow-y-auto py-6">
      <div className={`bg-hex-dark border border-hex-border rounded-lg w-full mx-4 shadow-2xl ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-hex-border">
          <h2 className="text-hex-gold font-semibold text-xs uppercase tracking-widest">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-hex-text-dim hover:text-hex-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-hex-text-dim uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// ── Rank fields row ────────────────────────────────────────────────────────────

function RankFields({
  label,
  tier, setTier,
  rank, setRank,
  lp, setLp,
  wins, setWins,
  losses, setLosses,
}: {
  label: string;
  tier: string; setTier: (v: string) => void;
  rank: string; setRank: (v: string) => void;
  lp: string;   setLp:   (v: string) => void;
  wins: string;  setWins: (v: string) => void;
  losses: string;setLosses:(v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-hex-text-dim uppercase tracking-wide mb-1.5">{label}</p>
      <div className="grid grid-cols-5 gap-1.5">
        <select value={tier} onChange={e => { setTier(e.target.value); if (HIGH_TIERS.has(e.target.value)) setRank(""); }} className="hex-input col-span-2 text-xs">
          {TIERS.map(t => <option key={t} value={t}>{t.charAt(0)+t.slice(1).toLowerCase()}</option>)}
        </select>
        {!HIGH_TIERS.has(tier) && (
          <select value={rank} onChange={e => setRank(e.target.value)} className="hex-input text-xs">
            {RANKS.filter(Boolean).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <input value={lp} onChange={e => setLp(e.target.value)} placeholder="LP" className={`hex-input text-xs ${HIGH_TIERS.has(tier) ? "col-span-3" : ""}`} />
        <input value={wins} onChange={e => setWins(e.target.value)} placeholder="W" className="hex-input text-xs" />
        <input value={losses} onChange={e => setLosses(e.target.value)} placeholder="L" className="hex-input text-xs" />
      </div>
    </div>
  );
}

// ── Blank league data ──────────────────────────────────────────────────────────

function blankLeague(): AccountData {
  return {
    ingameName: "", level: 0,
    soloTier: "UNRANKED", soloRank: "", soloLp: 0, soloWins: 0, soloLosses: 0,
    flexTier: "UNRANKED", flexRank: "", flexLp: 0, flexWins: 0, flexLosses: 0,
    topChampions: [],
    lastUpdated: new Date().toISOString(),
  };
}

// ── League data form (shared by Add + Edit modals) ────────────────────────────

interface LeagueFormState {
  ingameName: string; level: string;
  soloTier: string; soloRank: string; soloLp: string; soloWins: string; soloLosses: string;
  flexTier: string; flexRank: string; flexLp: string; flexWins: string; flexLosses: string;
  champs: { name: string; points: string; level: string }[];
}

function initLeagueForm(data: AccountData | null): LeagueFormState {
  const d = data ?? blankLeague();
  return {
    ingameName: d.ingameName, level: String(d.level || ""),
    soloTier: d.soloTier, soloRank: d.soloRank,
    soloLp: String(d.soloLp || ""), soloWins: String(d.soloWins || ""), soloLosses: String(d.soloLosses || ""),
    flexTier: d.flexTier, flexRank: d.flexRank,
    flexLp: String(d.flexLp || ""), flexWins: String(d.flexWins || ""), flexLosses: String(d.flexLosses || ""),
    champs: [
      ...d.topChampions.slice(0, 3).map(c => ({ name: c.name, points: String(c.points), level: String(c.level) })),
      ...Array(Math.max(0, 3 - d.topChampions.length)).fill({ name: "", points: "", level: "" }),
    ],
  };
}

function leagueFormToData(f: LeagueFormState): AccountData {
  return {
    ingameName: f.ingameName,
    level: parseInt(f.level) || 0,
    soloTier: f.soloTier, soloRank: HIGH_TIERS.has(f.soloTier) ? "" : f.soloRank,
    soloLp: parseInt(f.soloLp) || 0, soloWins: parseInt(f.soloWins) || 0, soloLosses: parseInt(f.soloLosses) || 0,
    flexTier: f.flexTier, flexRank: HIGH_TIERS.has(f.flexTier) ? "" : f.flexRank,
    flexLp: parseInt(f.flexLp) || 0, flexWins: parseInt(f.flexWins) || 0, flexLosses: parseInt(f.flexLosses) || 0,
    topChampions: f.champs.filter(c => c.name.trim()).map(c => ({
      name: c.name.trim(), points: parseInt(c.points) || 0, level: parseInt(c.level) || 0,
    })),
    lastUpdated: new Date().toISOString(),
  };
}

function LeagueFormFields({
  form, setForm,
}: {
  form: LeagueFormState;
  setForm: React.Dispatch<React.SetStateAction<LeagueFormState>>;
}) {
  const set = <K extends keyof LeagueFormState>(k: K) => (v: LeagueFormState[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ingame Name">
          <input value={form.ingameName} onChange={e => set("ingameName")(e.target.value)} placeholder="GameName" className="hex-input" />
        </Field>
        <Field label="Level">
          <input value={form.level} onChange={e => set("level")(e.target.value)} placeholder="0" className="hex-input" type="number" min="0" />
        </Field>
      </div>
      <RankFields label="SoloQ"
        tier={form.soloTier} setTier={set("soloTier")}
        rank={form.soloRank} setRank={set("soloRank")}
        lp={form.soloLp} setLp={set("soloLp")}
        wins={form.soloWins} setWins={set("soloWins")}
        losses={form.soloLosses} setLosses={set("soloLosses")}
      />
      <RankFields label="FlexQ"
        tier={form.flexTier} setTier={set("flexTier")}
        rank={form.flexRank} setRank={set("flexRank")}
        lp={form.flexLp} setLp={set("flexLp")}
        wins={form.flexWins} setWins={set("flexWins")}
        losses={form.flexLosses} setLosses={set("flexLosses")}
      />
      <div>
        <p className="text-xs font-medium text-hex-text-dim uppercase tracking-wide mb-1.5">Top Champions</p>
        <div className="space-y-1.5">
          {form.champs.map((c, i) => (
            <div key={i} className="grid grid-cols-3 gap-1.5">
              <input value={c.name} onChange={e => setForm(p => { const ch = [...p.champs]; ch[i] = { ...ch[i], name: e.target.value }; return { ...p, champs: ch }; })} placeholder={`Champion ${i + 1}`} className="hex-input text-xs col-span-1" />
              <input value={c.points} onChange={e => setForm(p => { const ch = [...p.champs]; ch[i] = { ...ch[i], points: e.target.value }; return { ...p, champs: ch }; })} placeholder="Points" className="hex-input text-xs" type="number" min="0" />
              <input value={c.level} onChange={e => setForm(p => { const ch = [...p.champs]; ch[i] = { ...ch[i], level: e.target.value }; return { ...p, champs: ch }; })} placeholder="Mastery" className="hex-input text-xs" type="number" min="0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Add Account Modal ──────────────────────────────────────────────────────────

function AddAccountModal({
  defaultPlatform,
  onAdd,
  onClose,
}: {
  defaultPlatform: string;
  onAdd: (a: Omit<Account, "id">, data: AccountData | null) => void;
  onClose: () => void;
}) {
  const [riotId, setRiotId]   = useState("");
  const [login, setLogin]     = useState("");
  const [notes, setNotes]     = useState("");
  const [region, setRegion]   = useState(defaultPlatform);
  const [error, setError]     = useState("");
  const [manual, setManual]   = useState(false);
  const [leagueForm, setLeagueForm] = useState<LeagueFormState>(initLeagueForm(null));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = riotId.split("#").map((s) => s.trim()).join("#");
    if (!trimmed.includes("#")) { setError('Must be in "GameName#Tag" format'); return; }
    const [name, tag] = trimmed.split("#");
    if (!name || !tag) { setError("Both name and tag are required"); return; }
    onAdd(
      { riotId: trimmed, login: login.trim() || undefined, notes: notes.trim() || undefined, region },
      manual ? leagueFormToData(leagueForm) : null,
    );
  };

  return (
    <Modal title="Add Account" onClose={onClose} wide={manual}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Riot ID *">
          <input
            value={riotId}
            onChange={(e) => { setRiotId(e.target.value); setError(""); }}
            placeholder="GameName#EUW"
            className="hex-input"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </Field>

        <Field label="Region">
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="hex-input">
            {REGIONS.map((r) => (
              <option key={r.platform} value={r.platform}>{r.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Login / Email (optional)">
          <input value={login} onChange={(e) => setLogin(e.target.value)} placeholder="account@email.com" className="hex-input" />
        </Field>

        <Field label="Notes (optional)">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. main, smurf…" className="hex-input" />
        </Field>

        <div>
          <button
            type="button"
            onClick={() => setManual(p => !p)}
            className="text-xs text-hex-gold hover:text-hex-gold-lt transition-colors flex items-center gap-1"
          >
            {manual ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {manual ? "Hide manual league data" : "Enter league data manually"}
          </button>
        </div>

        {manual && (
          <div className="border-t border-hex-border pt-4">
            <LeagueFormFields form={leagueForm} setForm={setLeagueForm} />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary flex-1">Add Account</button>
          <button type="button" onClick={onClose} className="btn-ghost px-4">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Edit Account Modal ─────────────────────────────────────────────────────────

function EditAccountModal({
  account,
  data,
  onSave,
  onClose,
}: {
  account: Account;
  data: AccountData | null;
  onSave: (patch: Partial<Omit<Account, "id">>, leagueData: AccountData) => void;
  onClose: () => void;
}) {
  const [riotId, setRiotId]   = useState(account.riotId);
  const [login, setLogin]     = useState(account.login ?? "");
  const [notes, setNotes]     = useState(account.notes ?? "");
  const [region, setRegion]   = useState(account.region);
  const [error, setError]     = useState("");
  const [leagueForm, setLeagueForm] = useState<LeagueFormState>(initLeagueForm(data));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = riotId.split("#").map((s) => s.trim()).join("#");
    if (!trimmed.includes("#")) { setError('Must be in "GameName#Tag" format'); return; }
    onSave(
      { riotId: trimmed, login: login.trim() || undefined, notes: notes.trim() || undefined, region },
      leagueFormToData(leagueForm),
    );
  };

  return (
    <Modal title="Edit Account" onClose={onClose} wide>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Riot ID *">
            <input value={riotId} onChange={e => { setRiotId(e.target.value); setError(""); }} className="hex-input" />
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </Field>
          <Field label="Region">
            <select value={region} onChange={e => setRegion(e.target.value)} className="hex-input">
              {REGIONS.map(r => <option key={r.platform} value={r.platform}>{r.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Login / Email (optional)">
            <input value={login} onChange={e => setLogin(e.target.value)} placeholder="account@email.com" className="hex-input" />
          </Field>
          <Field label="Notes (optional)">
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. main, smurf…" className="hex-input" />
          </Field>
        </div>

        <div className="border-t border-hex-border pt-4">
          <p className="text-xs font-medium text-hex-gold uppercase tracking-widest mb-3">League Data</p>
          <LeagueFormFields form={leagueForm} setForm={setLeagueForm} />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary flex-1">Save</button>
          <button type="button" onClick={onClose} className="btn-ghost px-4">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Settings Modal ─────────────────────────────────────────────────────────────

function SettingsModal({
  settings,
  onSave,
  onClose,
}: {
  settings: AppSettings;
  onSave: (s: Partial<AppSettings>) => void;
  onClose: () => void;
}) {
  const [apiKey,      setApiKey]      = useState(settings.apiKey);
  const [apiEnabled,  setApiEnabled]  = useState(settings.apiEnabled ?? true);
  const [showKey,     setShowKey]     = useState(false);
  const [platform,    setPlatform]    = useState(settings.region.platform);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const reg = REGIONS.find((r) => r.platform === platform) ?? REGIONS[0];
    onSave({ apiKey: apiKey.trim(), apiEnabled, region: { account: reg.account, platform: reg.platform } });
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center justify-between py-1">
          <span className="text-xs font-medium text-hex-text-dim uppercase tracking-wide">Riot API</span>
          <button
            type="button"
            onClick={() => setApiEnabled(p => !p)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${apiEnabled ? "bg-hex-gold" : "bg-hex-border"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${apiEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>

        {apiEnabled && (
          <Field label="Riot API Key">
            <div className="relative">
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type={showKey ? "text" : "password"}
                placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="hex-input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-hex-text-dim hover:text-hex-text transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-hex-text-dim mt-1.5">
              Get a free key at{" "}
              <span className="text-hex-gold">developer.riotgames.com</span>
            </p>
          </Field>
        )}

        <Field label="Default Region">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="hex-input">
            {REGIONS.map((r) => (
              <option key={r.platform} value={r.platform}>{r.label}</option>
            ))}
          </select>
        </Field>

        <p className="text-xs text-hex-text-dim bg-hex-bg/60 border border-hex-border rounded p-3">
          Settings are stored locally in your OS app-data folder. Your API key never leaves this machine.
        </p>

        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary flex-1">Save Settings</button>
          <button type="button" onClick={onClose} className="btn-ghost px-4">Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [cache,        setCache]        = useState<Record<string, AccountData>>({});
  const [settings,     setSettings]     = useState<AppSettings>({
    apiKey: "", apiEnabled: true,
    region: { account: "europe", platform: "euw1" },
  });
  const [champFilter,  setChampFilter]  = useState("");
  const [loadingIds,   setLoadingIds]   = useState<Set<string>>(new Set());
  const [globalLoad,   setGlobalLoad]   = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editTarget,   setEditTarget]   = useState<Account | null>(null);
  const [toasts,       setToasts]       = useState<{ id: number; msg: string; type: "error" | "info" }[]>([]);
  const [sortDir,      setSortDir]      = useState<"desc" | "asc">("desc");

  const apiEnabled = settings.apiEnabled ?? true;

  // ── Bootstrap ──
  useEffect(() => {
    Promise.all([
      window.electronAPI.getAccounts(),
      window.electronAPI.getCache(),
      window.electronAPI.getSettings(),
    ]).then(([accs, cacheData, sett]) => {
      setAccounts(accs);
      setCache(cacheData);
      setSettings(sett);
      if ((sett.apiEnabled ?? true) && !sett.apiKey.startsWith("RGAPI-")) setShowSettings(true);
    });
  }, []);

  // ── Toast helpers ──
  const toast = useCallback((msg: string, type: "error" | "info" = "error") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Derived data ──
  const displayAccounts = useMemo(() => {
    const needle = champFilter.toLowerCase().trim();
    const filtered = accounts.filter((a) => {
      if (!needle) return true;
      const data = cache[a.id];
      if (!data) return true;
      return data.topChampions.some((c) => c.name.toLowerCase().includes(needle));
    });
    return filtered.sort((a, b) => {
      const wa = rankWeight(cache[a.id]?.soloTier, cache[a.id]?.soloRank, cache[a.id]?.soloLp);
      const wb = rankWeight(cache[b.id]?.soloTier, cache[b.id]?.soloRank, cache[b.id]?.soloLp);
      const diff = sortDir === "desc" ? wb - wa : wa - wb;
      if (diff !== 0) return diff;
      const la = cache[a.id]?.level ?? 0;
      const lb = cache[b.id]?.level ?? 0;
      return sortDir === "desc" ? lb - la : la - lb;
    });
  }, [accounts, cache, champFilter, sortDir]);

  // ── Fetch one account ──
  const fetchOne = useCallback(
    async (account: Account) => {
      if (loadingIds.has(account.id)) return;
      setLoadingIds((p) => new Set(p).add(account.id));
      try {
        const result = await window.electronAPI.fetchAccountData(
          account.id, account.riotId, account.region
        );
        if ("error" in result) {
          toast(result.error);
        } else {
          setCache((p) => ({ ...p, [account.id]: result }));
        }
      } finally {
        setLoadingIds((p) => { const n = new Set(p); n.delete(account.id); return n; });
      }
    },
    [loadingIds, toast]
  );

  // ── Fetch all ──
  const fetchAll = async () => {
    if (!settings.apiKey.startsWith("RGAPI-")) { setShowSettings(true); return; }
    setGlobalLoad(true);
    await Promise.allSettled(accounts.map((a) => fetchOne(a)));
    setGlobalLoad(false);
  };

  // ── CRUD ──
  const addAccount = async (account: Omit<Account, "id">, data: AccountData | null) => {
    const added = await window.electronAPI.addAccount(account);
    setAccounts((p) => [...p, added]);
    if (data) {
      await window.electronAPI.setCache(added.id, data);
      setCache((p) => ({ ...p, [added.id]: data }));
    }
    setShowAdd(false);
  };

  const saveEdit = async (patch: Partial<Omit<Account, "id">>, leagueData: AccountData) => {
    if (!editTarget) return;
    await window.electronAPI.updateAccount(editTarget.id, patch);
    await window.electronAPI.setCache(editTarget.id, leagueData);
    setAccounts((p) => p.map((a) => a.id === editTarget.id ? { ...a, ...patch } : a));
    setCache((p) => ({ ...p, [editTarget.id]: leagueData }));
    setEditTarget(null);
  };

  const removeAccount = async (id: string) => {
    await window.electronAPI.removeAccount(id);
    setAccounts((p) => p.filter((a) => a.id !== id));
    setCache((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const saveSettings = async (s: Partial<AppSettings>) => {
    const merged = { ...settings, ...s };
    await window.electronAPI.saveSettings(merged);
    setSettings(merged);
    setShowSettings(false);
  };

  // ── Champion match helper ──
  const champMatch = (accountId: string): Champion | null => {
    const data = cache[accountId];
    if (!data) return null;
    const needle = champFilter.toLowerCase().trim();
    if (!needle) return data.topChampions[0] ?? null;
    return data.topChampions.find((c) => c.name.toLowerCase().includes(needle)) ?? null;
  };

  // ── Render ──
  return (
    <div className="flex flex-col h-screen bg-hex-bg text-hex-text overflow-hidden select-none">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 py-3 bg-hex-darker border-b border-hex-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Shield className="w-4 h-4 text-hex-gold" strokeWidth={1.5} />
          <span className="text-hex-gold text-xs font-semibold uppercase tracking-widest">
            League Account Manager
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded hover:bg-hex-border/50 text-hex-text-dim hover:text-hex-text transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-hex-gold text-hex-bg text-xs font-bold rounded hover:bg-hex-gold-lt transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Account
          </button>
        </div>
      </header>

      {/* ── Filter & Refresh bar ── */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-hex-dark border-b border-hex-border shrink-0">
        <div className="relative w-60">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-hex-text-dim" />
          <input
            value={champFilter}
            onChange={(e) => setChampFilter(e.target.value)}
            placeholder="Filter by champion…"
            className="w-full bg-hex-bg border border-hex-border rounded pl-8 pr-7 py-1.5 text-xs text-hex-text placeholder-hex-text-dim focus:outline-none focus:border-hex-gold transition-colors"
          />
          {champFilter && (
            <button
              onClick={() => setChampFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-hex-text-dim hover:text-hex-text"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <span className="text-xs text-hex-text-dim">
          {displayAccounts.length} / {accounts.length}
        </span>

        {apiEnabled && !settings.apiKey.startsWith("RGAPI-") && (
          <span className="text-xs text-yellow-500 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> No API key —{" "}
            <button onClick={() => setShowSettings(true)} className="underline hover:text-yellow-300">
              open Settings
            </button>
          </span>
        )}

        {apiEnabled && (
          <button
            onClick={fetchAll}
            disabled={globalLoad || accounts.length === 0}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-hex-border rounded text-xs text-hex-text hover:border-hex-gold hover:text-hex-gold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${globalLoad ? "animate-spin" : ""}`} />
            Refresh All
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-hex-text-dim">
            <Shield className="w-14 h-14 opacity-10" />
            <p className="text-sm">No accounts in the depot yet.</p>
            <button onClick={() => setShowAdd(true)} className="text-hex-gold text-sm hover:underline">
              + Add your first account
            </button>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-hex-border bg-hex-darker">
                {[
                  { label: "Login",       w: "w-48"  },
                  { label: "Ingame Name", w: "w-44"  },
                  { label: "Level",       w: "w-24"  },
                  { label: "SoloQ",       w: "w-44", sortable: true },
                  { label: "FlexQ",       w: "w-40"  },
                  { label: champFilter ? "Champion match" : "Top Champion", w: "" },
                  { label: "Actions",     w: "w-24"  },
                ].map((col) => (
                  <th
                    key={col.label}
                    onClick={col.sortable ? () => setSortDir((d) => d === "desc" ? "asc" : "desc") : undefined}
                    className={`
                      px-4 py-2.5 text-left text-hex-gold text-[10px] font-semibold uppercase tracking-wider
                      sticky top-0 z-10 bg-hex-darker border-b border-hex-border
                      ${col.w} ${col.sortable ? "cursor-pointer hover:text-hex-gold-lt select-none" : ""}
                    `}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && (
                        sortDir === "desc"
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronUp className="w-3 h-3" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {displayAccounts.map((account) => {
                const data      = cache[account.id];
                const isLoading = loadingIds.has(account.id);
                const match     = champMatch(account.id);

                return (
                  <tr
                    key={account.id}
                    className={`border-b border-hex-border/40 transition-colors hover:bg-hex-gold/5 ${isLoading ? "opacity-50" : ""}`}
                  >
                    {/* Login */}
                    <td className="px-4 py-3">
                      {account.login ? (
                        <div className="font-mono text-xs text-hex-gold truncate max-w-[10rem]">
                          {account.login}
                        </div>
                      ) : (
                        <div className="text-xs text-hex-text-dim truncate max-w-[10rem] italic">—</div>
                      )}
                      <div className="text-xs text-hex-text-dim truncate max-w-[10rem] mt-0.5">
                        {account.riotId}
                      </div>
                      {account.notes && (
                        <div className="text-[10px] text-hex-text-dim/60 truncate max-w-[10rem]">
                          {account.notes}
                        </div>
                      )}
                    </td>

                    {/* Ingame Name */}
                    <td className="px-4 py-3">
                      {data ? (
                        <>
                          <div className="font-medium text-hex-text">{data.ingameName}</div>
                          <div className="text-xs text-hex-text-dim">
                            #{account.riotId.split("#")[1]}
                          </div>
                          <div className="text-[10px] text-hex-text-dim/60 mt-0.5">
                            {new Date(data.lastUpdated).toLocaleDateString()}
                          </div>
                        </>
                      ) : (
                        <span className="text-hex-text-dim text-xs">Not fetched</span>
                      )}
                    </td>

                    {/* Level */}
                    <td className="px-4 py-3">
                      {data ? <LevelBadge level={data.level} /> : <span className="text-hex-text-dim text-xs">—</span>}
                    </td>

                    {/* SoloQ */}
                    <td className="px-4 py-3">
                      {data ? (
                        <RankBadge tier={data.soloTier} rank={data.soloRank} lp={data.soloLp} wins={data.soloWins} losses={data.soloLosses} />
                      ) : (
                        <span className="text-hex-text-dim text-xs">—</span>
                      )}
                    </td>

                    {/* FlexQ */}
                    <td className="px-4 py-3">
                      {data ? (
                        <RankBadge tier={data.flexTier} rank={data.flexRank} lp={data.flexLp} wins={data.flexWins} losses={data.flexLosses} />
                      ) : (
                        <span className="text-hex-text-dim text-xs">—</span>
                      )}
                    </td>

                    {/* Champion */}
                    <td className="px-4 py-3">
                      <ChampionCell champ={match} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {apiEnabled && (
                          <button
                            onClick={() => fetchOne(account)}
                            disabled={isLoading}
                            title="Refresh from API"
                            className="p-1.5 rounded hover:bg-hex-border text-hex-text-dim hover:text-hex-blue transition-colors disabled:opacity-40"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
                          </button>
                        )}
                        <button
                          onClick={() => setEditTarget(account)}
                          title="Edit"
                          className="p-1.5 rounded hover:bg-hex-border text-hex-text-dim hover:text-hex-gold transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeAccount(account.id)}
                          title="Remove"
                          className="p-1.5 rounded hover:bg-hex-border text-hex-text-dim hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modals ── */}
      {showAdd && (
        <AddAccountModal
          defaultPlatform={settings.region.platform}
          onAdd={addAccount}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editTarget && (
        <EditAccountModal
          account={editTarget}
          data={cache[editTarget.id] ?? null}
          onSave={saveEdit}
          onClose={() => setEditTarget(null)}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* ── Toast stack ── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.msg} type={t.type} />
        ))}
      </div>
    </div>
  );
}
