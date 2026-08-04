# Daily Planner

Cross-platform desktop app (macOS + Windows) for planning daily tasks. Each device keeps a local SQLite database and syncs through a file in your OneDrive folder.

## Features

- Left sidebar: create days, collapse/expand to preview tasks, completed-task total
- Main panel: task title, time units (1 unit ≈ 30 minutes), optional comment, complete/edit/delete
- Search across task titles and comments
- OneDrive folder sync via per-device JSON snapshots (record conflicts use `updated_at`)
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
5. Planner changes automatically update that device's snapshot. After OneDrive
   finishes uploading/downloading, reopen or sync on the other device to pull
   the changes.

The app never puts the live SQLite file in OneDrive. Each installation writes
only its own `daily-planner-sync-<device-id>.json` and merges all device
snapshots, so simultaneous or delayed OneDrive updates cannot overwrite another
device's data. Older `daily-planner-sync.json` files are still read for
automatic migration.

## Data

- Local DB: app data directory, file `daily-planner.db`
- Settings (sync folder path, device ID, last sync time): `settings.json` in app data
- Sync files: `DailyPlannerSync/daily-planner-sync-<device-id>.json`
