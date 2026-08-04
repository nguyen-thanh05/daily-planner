import { describe, expect, it } from "vitest";
import type { Day, SyncPayload, Task } from "../types";
import {
  createSerialTaskRunner,
  dayIdForDate,
  deviceSyncFileName,
  LEGACY_SYNC_FILE_NAME,
  mergeById,
  mergeSyncStates,
  parsePayload,
  syncFilePath,
} from "./sync-core";

const EARLIER = "2026-08-01T10:00:00.000Z";
const LATER = "2026-08-02T10:00:00.000Z";

function day(overrides: Partial<Day> = {}): Day {
  return {
    id: "day-a",
    date: "2026-08-03",
    collapsed: false,
    created_at: EARLIER,
    updated_at: EARLIER,
    deleted_at: null,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-a",
    day_id: "day-a",
    title: "Task A",
    units: 1,
    comment: null,
    completed: false,
    sort_order: 0,
    created_at: EARLIER,
    updated_at: EARLIER,
    deleted_at: null,
    ...overrides,
  };
}

function payload(days: Day[], tasks: Task[]): SyncPayload {
  return {
    version: 1,
    exported_at: LATER,
    days,
    tasks,
  };
}

describe("cross-device merge", () => {
  it("unions concurrent additions from two device snapshots", () => {
    const merged = mergeSyncStates(
      [],
      [],
      [
        payload([day()], [task()]),
        payload(
          [day({ id: "day-b" })],
          [task({ id: "task-b", day_id: "day-b", title: "Task B" })],
        ),
      ],
    );

    expect(merged.days).toHaveLength(1);
    expect(merged.days[0].id).toBe(dayIdForDate("2026-08-03"));
    expect(merged.tasks.map((item) => item.id)).toEqual(["task-a", "task-b"]);
    expect(merged.tasks.every((item) => item.day_id === merged.days[0].id)).toBe(
      true,
    );
  });

  it("keeps local data when snapshots are missing or stale", () => {
    const localTask = task({ title: "Local edit", updated_at: LATER });
    const staleTask = task({ title: "Stale remote", updated_at: EARLIER });

    expect(mergeSyncStates([day()], [localTask], []).tasks[0].title).toBe(
      "Local edit",
    );
    expect(
      mergeSyncStates([day()], [localTask], [payload([day()], [staleTask])])
        .tasks[0].title,
    ).toBe("Local edit");
  });

  it("propagates a newer deletion tombstone", () => {
    const live = task();
    const deleted = task({ updated_at: LATER, deleted_at: LATER });

    const merged = mergeSyncStates(
      [day()],
      [live],
      [payload([day()], [deleted])],
    );

    expect(merged.tasks[0].deleted_at).toBe(LATER);
  });

  it("uses deletion precedence and a stable tie-breaker at equal timestamps", () => {
    const live = task({ title: "Live" });
    const deleted = task({ title: "Deleted", deleted_at: EARLIER });
    expect(mergeById([live], [deleted])[0]).toEqual(deleted);

    const alpha = task({ title: "Alpha" });
    const omega = task({ title: "Omega" });
    expect(mergeById([alpha], [omega])).toEqual(mergeById([omega], [alpha]));
  });

  it("chooses one same-date day and remaps every task to it", () => {
    const olderDay = day({ id: "old-day" });
    const newerDay = day({
      id: "new-day",
      collapsed: true,
      updated_at: LATER,
    });
    const merged = mergeSyncStates(
      [olderDay],
      [task({ id: "old-task", day_id: olderDay.id })],
      [
        payload(
          [newerDay],
          [task({ id: "new-task", day_id: newerDay.id })],
        ),
      ],
    );

    expect(merged.days).toEqual([
      expect.objectContaining({
        id: dayIdForDate(olderDay.date),
        collapsed: true,
        updated_at: LATER,
      }),
    ]);
    expect(
      merged.tasks.every((item) => item.day_id === dayIdForDate(olderDay.date)),
    ).toBe(true);
  });
});

describe("sync file compatibility", () => {
  it("parses and merges the legacy version-one payload", () => {
    const legacy = payload([day()], [task()]);
    const parsed = parsePayload(JSON.stringify(legacy));
    const merged = mergeSyncStates([], [], [parsed]);

    expect(LEGACY_SYNC_FILE_NAME).toBe("daily-planner-sync.json");
    expect(merged.tasks).toHaveLength(1);
  });

  it("rejects malformed snapshots before they can be merged", () => {
    expect(() =>
      parsePayload(
        JSON.stringify({
          version: 1,
          exported_at: LATER,
          days: [],
          tasks: [{ id: "incomplete" }],
        }),
      ),
    ).toThrow("Invalid sync file format");
  });

  it("builds device-specific paths on macOS and Windows", () => {
    const fileName = deviceSyncFileName("device-123");
    expect(fileName).toBe("daily-planner-sync-device-123.json");
    expect(syncFilePath("/Users/me/OneDrive/", fileName)).toBe(
      `/Users/me/OneDrive/${fileName}`,
    );
    expect(syncFilePath("C:\\Users\\me\\OneDrive\\", fileName)).toBe(
      `C:\\Users\\me\\OneDrive\\${fileName}`,
    );
  });
});

describe("sync serialization", () => {
  it("runs overlapping sync requests one at a time", async () => {
    const runSerially = createSerialTaskRunner();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = runSerially(
      () =>
        new Promise<string>((resolve) => {
          events.push("first:start");
          releaseFirst = () => {
            events.push("first:end");
            resolve("first");
          };
        }),
    );
    const second = runSerially(async () => {
      events.push("second:start");
      events.push("second:end");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });
});
