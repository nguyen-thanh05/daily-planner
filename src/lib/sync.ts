import { invoke } from "@tauri-apps/api/core";
import type { Day, SyncPayload, Task } from "../types";
import {
  listAllDaysIncludingDeleted,
  listAllTasksIncludingDeleted,
  upsertDayFromSync,
  upsertTaskFromSync,
} from "./db";
import { getSyncFolder, setLastSyncAt } from "./settings";

export const SYNC_FILE_NAME = "daily-planner-sync.json";

function syncFilePath(folder: string): string {
  const sep = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  const trimmed = folder.replace(/[/\\]+$/, "");
  return `${trimmed}${sep}${SYNC_FILE_NAME}`;
}

function newer(a: string, b: string): boolean {
  return a > b;
}

function mergeById<T extends { id: string; updated_at: string }>(
  local: T[],
  remote: T[],
): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing || newer(item.updated_at, existing.updated_at)) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

export function buildPayload(days: Day[], tasks: Task[]): SyncPayload {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    days,
    tasks,
  };
}

function parsePayload(raw: string): SyncPayload {
  const data = JSON.parse(raw) as SyncPayload;
  if (!data || data.version !== 1 || !Array.isArray(data.days) || !Array.isArray(data.tasks)) {
    throw new Error("Invalid sync file format");
  }
  return data;
}

export async function exportPayloadToPath(path: string): Promise<void> {
  const days = await listAllDaysIncludingDeleted();
  const tasks = await listAllTasksIncludingDeleted();
  const payload = buildPayload(days, tasks);
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
  const mergedDays = mergeById(localDays, remote.days);
  const mergedTasks = mergeById(localTasks, remote.tasks);

  for (const day of mergedDays) {
    await upsertDayFromSync(day);
  }
  for (const task of mergedTasks) {
    await upsertTaskFromSync(task);
  }
}

export async function syncNow(): Promise<{ folder: string; at: string }> {
  const folder = await getSyncFolder();
  if (!folder) {
    throw new Error("Choose a OneDrive sync folder in Settings first.");
  }

  const path = syncFilePath(folder);
  const localDays = await listAllDaysIncludingDeleted();
  const localTasks = await listAllTasksIncludingDeleted();

  const raw = await invoke<string | null>("read_text_file", { path });
  let mergedDays = localDays;
  let mergedTasks = localTasks;

  if (raw) {
    const remote = parsePayload(raw);
    mergedDays = mergeById(localDays, remote.days);
    mergedTasks = mergeById(localTasks, remote.tasks);

    for (const day of mergedDays) {
      await upsertDayFromSync(day);
    }
    for (const task of mergedTasks) {
      await upsertTaskFromSync(task);
    }
  }

  const payload = buildPayload(mergedDays, mergedTasks);
  await invoke("write_text_file", {
    path,
    contents: JSON.stringify(payload, null, 2),
  });

  const at = new Date().toISOString();
  await setLastSyncAt(at);
  return { folder, at };
}
