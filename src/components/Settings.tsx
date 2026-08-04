import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { getLastSyncAt, getSyncFolder, setSyncFolder } from "../lib/settings";
import {
  exportPayloadToPath,
  importPayloadFromPath,
  SYNC_FILE_NAME,
  syncNow,
} from "../lib/sync";

type Props = {
  open: boolean;
  onClose: () => void;
  onSynced: () => Promise<void>;
  syncFolder: string | null;
  lastSyncAt: string | null;
  onSettingsChange: (folder: string | null, lastSyncAt: string | null) => void;
};

function formatTs(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

export function Settings({
  open: isOpen,
  onClose,
  onSynced,
  syncFolder,
  lastSyncAt,
  onSettingsChange,
}: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  async function chooseFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Choose OneDrive DailyPlannerSync folder",
    });
    if (typeof selected === "string") {
      await setSyncFolder(selected);
      const last = await getLastSyncAt();
      onSettingsChange(selected, last);
      setStatus(`Sync folder set to ${selected}`);
    }
  }

  async function handleSync() {
    setBusy(true);
    setStatus(null);
    try {
      const result = await syncNow();
      onSettingsChange(result.folder, result.at);
      await onSynced();
      setStatus(`Synced at ${formatTs(result.at)}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setStatus(null);
    try {
      const path = await save({
        defaultPath: SYNC_FILE_NAME,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await exportPayloadToPath(path);
      setStatus(`Exported to ${path}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    setBusy(true);
    setStatus(null);
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      await importPayloadFromPath(path);
      await onSynced();
      const folder = await getSyncFolder();
      const last = await getLastSyncAt();
      onSettingsChange(folder, last);
      setStatus(`Imported from ${path}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="settings-title">Settings & sync</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="modal-body">
          <section>
            <h3>OneDrive sync folder</h3>
            <p className="muted">
              Create <code>DailyPlannerSync</code> inside OneDrive on both Mac
              and Windows, then choose that folder here. Each device writes its
              own sync snapshot and merges snapshots from the other devices —
              never the live database. Existing <code>{SYNC_FILE_NAME}</code>{" "}
              files are imported automatically.
            </p>
            <p className="path-display">{syncFolder ?? "No folder selected"}</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={() => void chooseFolder()}
                disabled={busy}
              >
                Choose folder
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSync()}
                disabled={busy || !syncFolder}
              >
                Sync now
              </button>
            </div>
            <p className="muted">Last sync: {formatTs(lastSyncAt)}</p>
          </section>

          <section>
            <h3>Manual backup</h3>
            <div className="btn-row">
              <button
                type="button"
                className="btn"
                onClick={() => void handleExport()}
                disabled={busy}
              >
                Export JSON
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void handleImport()}
                disabled={busy}
              >
                Import JSON
              </button>
            </div>
          </section>

          {status && <p className="status-line">{status}</p>}
        </div>
      </div>
    </div>
  );
}
