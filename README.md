# Daily Planner

Cross-platform desktop app (macOS + Windows) for planning daily tasks. Each device keeps a local SQLite database and syncs through a file in your OneDrive folder.

## Features

- Left sidebar: create days, collapse/expand to preview tasks, completed-task total
- Main panel: task title, time units (1 unit ≈ 30 minutes), optional comment, complete/edit/delete
- Search across task titles and comments
- OneDrive folder sync via `daily-planner-sync.json` (last-write-wins by `updated_at`)
- Manual JSON export / import backup

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- Platform build tools:
  - macOS: Xcode Command Line Tools
  - Windows: [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + WebView2

## Develop

```bash
npm install
npm run tauri:dev
```

## Build installers

```bash
npm run tauri:build
```

Artifacts land in `src-tauri/target/release/bundle/`.

## OneDrive sync setup

1. Install OneDrive on Mac and Windows and sign in with the same Microsoft account.
2. Create a folder named `DailyPlannerSync` in your OneDrive root.
3. Open **Daily Planner → Settings → Choose folder** and select that folder on each device.
4. Click **Sync now** (or reopen the app — it syncs on launch when a folder is set).
5. After editing on one machine, wait for OneDrive to finish uploading/downloading, then sync on the other.

The app never puts the live SQLite file in OneDrive. Only `daily-planner-sync.json` is shared, which avoids database corruption from cloud file sync.

## Data

- Local DB: app data directory, file `daily-planner.db`
- Settings (sync folder path, last sync time): `settings.json` in app data
- Sync file: `DailyPlannerSync/daily-planner-sync.json`
