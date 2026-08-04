import type { Day, SyncPayload, Task } from "../types";

export const LEGACY_SYNC_FILE_NAME = "daily-planner-sync.json";
export const DEVICE_SYNC_FILE_PREFIX = "daily-planner-sync-";

type MergeRecord = {
  id: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type MergedState = {
  days: Day[];
  tasks: Task[];
};

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function stableRecordKey(record: MergeRecord): string {
  const entries = Object.keys(record)
    .sort()
    .map((key) => [key, (record as Record<string, unknown>)[key]]);
  return JSON.stringify(entries);
}

function compareRecords<T extends MergeRecord>(a: T, b: T): number {
  const timestampOrder = compareText(a.updated_at, b.updated_at);
  if (timestampOrder !== 0) return timestampOrder;

  const deletionOrder = Number(Boolean(a.deleted_at)) - Number(Boolean(b.deleted_at));
  if (deletionOrder !== 0) return deletionOrder;

  return compareText(stableRecordKey(a), stableRecordKey(b));
}

export function mergeById<T extends MergeRecord>(...sources: T[][]): T[] {
  const records = new Map<string, T>();
  for (const source of sources) {
    for (const candidate of source) {
      const existing = records.get(candidate.id);
      if (!existing || compareRecords(candidate, existing) > 0) {
        records.set(candidate.id, candidate);
      }
    }
  }
  return Array.from(records.values());
}

export function dayIdForDate(date: string): string {
  return `day:${date}`;
}

export function normalizeDaysAndTasks(days: Day[], tasks: Task[]): MergedState {
  const daysByDate = new Map<string, Day[]>();
  for (const day of mergeById(days)) {
    const group = daysByDate.get(day.date) ?? [];
    group.push(day);
    daysByDate.set(day.date, group);
  }

  const dayIdMap = new Map<string, string>();
  const normalizedDays: Day[] = [];
  for (const [date, group] of daysByDate) {
    const winner = group.reduce((best, candidate) =>
      compareRecords(candidate, best) > 0 ? candidate : best,
    );
    const canonicalId = dayIdForDate(date);
    for (const day of group) {
      dayIdMap.set(day.id, canonicalId);
    }
    normalizedDays.push({ ...winner, id: canonicalId });
  }

  const normalizedTasks = mergeById(tasks).map((task) => {
    const canonicalDayId = dayIdMap.get(task.day_id);
    return canonicalDayId && canonicalDayId !== task.day_id
      ? { ...task, day_id: canonicalDayId }
      : task;
  });

  normalizedDays.sort((a, b) => compareText(a.id, b.id));
  normalizedTasks.sort((a, b) => compareText(a.id, b.id));
  return { days: normalizedDays, tasks: normalizedTasks };
}

export function mergeSyncStates(
  localDays: Day[],
  localTasks: Task[],
  snapshots: SyncPayload[],
): MergedState {
  const days = mergeById(localDays, ...snapshots.map((payload) => payload.days));
  const tasks = mergeById(localTasks, ...snapshots.map((payload) => payload.tasks));
  return normalizeDaysAndTasks(days, tasks);
}

export function buildPayload(days: Day[], tasks: Task[]): SyncPayload {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    days,
    tasks,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isDay(value: unknown): value is Day {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.collapsed === "boolean" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    isNullableString(value.deleted_at)
  );
}

function isTask(value: unknown): value is Task {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.day_id === "string" &&
    typeof value.title === "string" &&
    typeof value.units === "number" &&
    Number.isFinite(value.units) &&
    isNullableString(value.comment) &&
    typeof value.completed === "boolean" &&
    typeof value.sort_order === "number" &&
    Number.isFinite(value.sort_order) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    isNullableString(value.deleted_at)
  );
}

export function parsePayload(raw: string): SyncPayload {
  const value: unknown = JSON.parse(raw);
  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.exported_at !== "string" ||
    !Array.isArray(value.days) ||
    !value.days.every(isDay) ||
    !Array.isArray(value.tasks) ||
    !value.tasks.every(isTask)
  ) {
    throw new Error("Invalid sync file format");
  }
  return value as SyncPayload;
}

export function syncFilePath(folder: string, fileName: string): string {
  const separator = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  const trimmed = folder.replace(/[/\\]+$/, "");
  return `${trimmed}${separator}${fileName}`;
}

export function deviceSyncFileName(deviceId: string): string {
  return `${DEVICE_SYNC_FILE_PREFIX}${deviceId}.json`;
}

export function createSerialTaskRunner() {
  let tail: Promise<void> = Promise.resolve();

  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
