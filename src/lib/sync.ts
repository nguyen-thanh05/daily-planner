import { invoke } from "@tauri-apps/api/core";
import type { SyncPayload } from "../types";
import {
  listAllDaysIncludingDeleted,
  listAllTasksIncludingDeleted,
  upsertDayFromSync,
  upsertTaskFromSync,
} from "./db";
import { getOrCreateSyncDeviceId, getSyncFolder, setLastSyncAt } from "./settings";
import {
  buildPayload,
  createSerialTaskRunner,
  deviceSyncFileName,
  LEGACY_SYNC_FILE_NAME,
  mergeSyncStates,
  normalizeDaysAndTasks,
  parsePayload,
  syncFilePath,
  type MergedState,
} from "./sync-core";

export const SYNC_FILE_NAME = LEGACY_SYNC_FILE_NAME;
export { buildPayload };

const runSerially = createSerialTaskRunner();

async function applyMergedState(state: MergedState): Promise<void> {
  const localDayIds = new Map<string, string>();
  for (const day of state.days) {
    const localId = await upsertDayFromSync(day);
    localDayIds.set(day.id, localId);
  }
  for (const task of state.tasks) {
    const localDayId = localDayIds.get(task.day_id);
    await upsertTaskFromSync(
      localDayId && localDayId !== task.day_id
        ? { ...task, day_id: localDayId }
        : task,
    );
  }
}

async function readSnapshots(paths: string[]): Promise<SyncPayload[]> {
  const snapshots: SyncPayload[] = [];
  for (const path of paths) {
    const raw = await invoke<string | null>("read_text_file", { path });
    if (raw !== null) {
      snapshots.push(parsePayload(raw));
    }
  }
  return snapshots;
}

export async function exportPayloadToPath(path: string): Promise<void> {
  const days = await listAllDaysIncludingDeleted();
  const tasks = await listAllTasksIncludingDeleted();
  const normalized = normalizeDaysAndTasks(days, tasks);
  const payload = buildPayload(normalized.days, normalized.tasks);
  await invoke("write_text_file", {
    path,
    contents: JSON.stringify(payload, null, 2),
  });
}

export async function importPayloadFromPath(path: string): Promise<void> {
  const raw = await invoke<string | null>("read_text_file", { path });
  if (!raw) throw new Error("File not found");
  const remote = parsePayload(raw);
  const localDays = await listAllDaysIncludingDeleted();
  const localTasks = await listAllTasksIncludingDeleted();
  const merged = mergeSyncStates(localDays, localTasks, [remote]);
  await applyMergedState(merged);
}

async function performSync(): Promise<{ folder: string; at: string }> {
  const folder = await getSyncFolder();
  if (!folder) {
    throw new Error("Choose a OneDrive sync folder in Settings first.");
  }

  const deviceId = await getOrCreateSyncDeviceId();
  const paths = await invoke<string[]>("list_sync_files", { folder });
  const snapshots = await readSnapshots(paths);
  const localDays = await listAllDaysIncludingDeleted();
  const localTasks = await listAllTasksIncludingDeleted();
  const merged = mergeSyncStates(localDays, localTasks, snapshots);

  await applyMergedState(merged);

  const path = syncFilePath(folder, deviceSyncFileName(deviceId));
  const payload = buildPayload(merged.days, merged.tasks);
  await invoke("write_text_file", {
    path,
    contents: JSON.stringify(payload, null, 2),
  });

  const at = new Date().toISOString();
  await setLastSyncAt(at);
  return { folder, at };
}

export function syncNow(): Promise<{ folder: string; at: string }> {
  return runSerially(performSync);
}
