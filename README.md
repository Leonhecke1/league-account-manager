# League Account Manager

A desktop app for managing multiple League of Legends accounts. Built with Electron, React, and Tailwind CSS in a Hextech dark theme.

## Features

- **Account depot** — store multiple accounts with login, Riot ID, region, and notes
- **Live data** — fetch rank, level, and champion mastery via the Riot API
- **Manual entry** — enter or edit league data manually without an API key
- **Sort & filter** — sort by SoloQ rank, filter table by champion name
- **API toggle** — disable API fetching to use the app fully offline/manual

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get a Riot API key

Go to [developer.riotgames.com](https://developer.riotgames.com), log in, and copy your key (`RGAPI-...`).

> Development keys expire every 24 hours. Regenerate and re-paste when needed.

### 3. Run in dev mode

```bash
npm run dev
```

### 4. Build installer (Windows)

```bash
npm run package:win
```

Output goes to `release/`.

## First launch

On first launch the Settings modal opens automatically. Paste your API key and select your default region. Settings are stored locally in your OS app-data folder — the key never leaves your machine.

## Adding accounts

Click **Add Account** and fill in:

| Field | Description |
|---|---|
| Riot ID | `GameName#Tag` — the in-game display name |
| Region | Server the account plays on |
| Login | Your Riot login username (optional, for reference) |
| Notes | Any label, e.g. main / smurf |

Expand **Enter league data manually** to pre-fill rank and champion data without an API fetch.

## Editing accounts

Click the pencil icon on any row to edit account info and league data at any time.

## Data storage

All data is stored locally in your OS user-data folder:

| File | Contents |
|---|---|
| `accounts.json` | Account list (no passwords stored) |
| `cache.json` | Last fetched league data per account |
| `settings.json` | API key and default region |

**Windows:** `%APPDATA%\league-account-manager\`

## Tech stack

- [Electron](https://www.electronjs.org/) v31
- [React](https://react.dev/) 18 + TypeScript
- [Tailwind CSS](https://tailwindcss.com/) v3
- [electron-vite](https://electron-vite.org/) — build pipeline
- [electron-builder](https://www.electron.build/) — NSIS installer
- [Riot Games API](https://developer.riotgames.com/apis)
