import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Day, SyncPayload, Task } from "../types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listDays: vi.fn(),
  listTasks: vi.fn(),
  upsertDay: vi.fn(),
  upsertTask: vi.fn(),
  getDeviceId: vi.fn(),
  getSyncFolder: vi.fn(),
  setLastSyncAt: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("./db", () => ({
  listAllDaysIncludingDeleted: mocks.listDays,
  listAllTasksIncludingDeleted: mocks.listTasks,
  upsertDayFromSync: mocks.upsertDay,
  upsertTaskFromSync: mocks.upsertTask,
}));
vi.mock("./settings", () => ({
  getOrCreateSyncDeviceId: mocks.getDeviceId,
  getSyncFolder: mocks.getSyncFolder,
  setLastSyncAt: mocks.setLastSyncAt,
}));

import { syncNow } from "./sync";

const DATE = "2026-08-03";
const TIMESTAMP = "2026-08-03T12:00:00.000Z";

function day(id: string): Day {
  return {
    id,
    date: DATE,
    collapsed: false,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    deleted_at: null,
  };
}

function task(id: string, dayId: string): Task {
  return {
    id,
    day_id: dayId,
    title: id,
    units: 1,
    comment: null,
    completed: false,
    sort_order: 0,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    deleted_at: null,
  };
}

function payload(dayId: string, taskId: string): SyncPayload {
  return {
    version: 1,
    exported_at: TIMESTAMP,
    days: [day(dayId)],
    tasks: [task(taskId, dayId)],
  };
}

describe.sequential("syncNow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSyncFolder.mockResolvedValue("/OneDrive/DailyPlannerSync");
    mocks.getDeviceId.mockResolvedValue("this-device");
    mocks.listDays.mockResolvedValue([day("local-day")]);
    mocks.listTasks.mockResolvedValue([task("local-task", "local-day")]);
    mocks.upsertDay.mockImplementation(async (value: Day) => value.id);
    mocks.upsertTask.mockResolvedValue(undefined);
    mocks.setLastSyncAt.mockResolvedValue(undefined);
  });

  it("merges legacy and peer snapshots but writes only its own snapshot", async () => {
    const legacyPath = "/OneDrive/DailyPlannerSync/daily-planner-sync.json";
    const peerPath =
      "/OneDrive/DailyPlannerSync/daily-planner-sync-peer-device.json";
    mocks.upsertDay.mockResolvedValue("existing-local-day");
    mocks.invoke.mockImplementation(
      async (command: string, args: Record<string, unknown>) => {
        if (command === "list_sync_files") return [legacyPath, peerPath];
        if (command === "read_text_file" && args.path === legacyPath) {
          return JSON.stringify(payload("legacy-day", "legacy-task"));
        }
        if (command === "read_text_file" && args.path === peerPath) {
          return JSON.stringify(payload("peer-day", "peer-task"));
        }
        if (command === "write_text_file") return undefined;
        throw new Error(`Unexpected command: ${command}`);
      },
    );

    await syncNow();

    const writeCall = mocks.invoke.mock.calls.find(
      ([command]) => command === "write_text_file",
    );
    expect(writeCall?.[1]).toMatchObject({
      path: "/OneDrive/DailyPlannerSync/daily-planner-sync-this-device.json",
    });

    const written = JSON.parse(
      (writeCall?.[1] as { contents: string }).contents,
    ) as SyncPayload;
    expect(written.days).toHaveLength(1);
    expect(written.tasks.map((item) => item.id)).toEqual([
      "legacy-task",
      "local-task",
      "peer-task",
    ]);
    expect(mocks.upsertDay).toHaveBeenCalledTimes(1);
    expect(mocks.upsertTask).toHaveBeenCalledTimes(3);
    expect(
      mocks.upsertTask.mock.calls.every(
        ([value]) => (value as Task).day_id === "existing-local-day",
      ),
    ).toBe(true);
    expect(mocks.setLastSyncAt).toHaveBeenCalledOnce();
  });

  it("does not update the database or write when a snapshot is malformed", async () => {
    const badPath =
      "/OneDrive/DailyPlannerSync/daily-planner-sync-broken.json";
    mocks.invoke.mockImplementation(
      async (command: string, args: Record<string, unknown>) => {
        if (command === "list_sync_files") return [badPath];
        if (command === "read_text_file" && args.path === badPath) {
          return '{"version":1,"days":[],"tasks":"not-an-array"}';
        }
        if (command === "write_text_file") return undefined;
        throw new Error(`Unexpected command: ${command}`);
      },
    );

    await expect(syncNow()).rejects.toThrow("Invalid sync file format");
    expect(mocks.upsertDay).not.toHaveBeenCalled();
    expect(mocks.upsertTask).not.toHaveBeenCalled();
    expect(
      mocks.invoke.mock.calls.some(([command]) => command === "write_text_file"),
    ).toBe(false);
  });
});
