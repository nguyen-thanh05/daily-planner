import Database from "@tauri-apps/plugin-sql";
import type { Day, Task } from "../types";

let dbPromise: Promise<Database> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}

async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await Database.load("sqlite:daily-planner.db");
      await db.execute("PRAGMA foreign_keys = ON");
      await db.execute(`
        CREATE TABLE IF NOT EXISTS days (
          id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL UNIQUE,
          collapsed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT
        )
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY NOT NULL,
          day_id TEXT NOT NULL,
          title TEXT NOT NULL,
          units INTEGER NOT NULL DEFAULT 1,
          comment TEXT,
          completed INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (day_id) REFERENCES days(id)
        )
      `);
      await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_tasks_day_id ON tasks(day_id)",
      );
      return db;
    })();
  }
  return dbPromise;
}

function mapDay(row: Record<string, unknown>): Day {
  return {
    id: String(row.id),
    date: String(row.date),
    collapsed: Boolean(row.collapsed),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

function mapTask(row: Record<string, unknown>): Task {
  return {
    id: String(row.id),
    day_id: String(row.day_id),
    title: String(row.title),
    units: Number(row.units),
    comment: row.comment == null ? null : String(row.comment),
    completed: Boolean(row.completed),
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

export async function listDays(): Promise<Day[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM days WHERE deleted_at IS NULL ORDER BY date DESC`,
  );
  return rows.map(mapDay);
}

export async function listAllDaysIncludingDeleted(): Promise<Day[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM days`,
  );
  return rows.map(mapDay);
}

export async function listTasksForDay(dayId: string): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM tasks
     WHERE day_id = $1 AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [dayId],
  );
  return rows.map(mapTask);
}

export async function listAllTasks(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC`,
  );
  return rows.map(mapTask);
}

export async function listAllTasksIncludingDeleted(): Promise<Task[]> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM tasks`,
  );
  return rows.map(mapTask);
}

export async function countCompletedTasks(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ count: number }[]>(
    `SELECT COUNT(*) as count FROM tasks
     WHERE completed = 1 AND deleted_at IS NULL`,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function createDay(date: string): Promise<Day> {
  const db = await getDb();
  const existing = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM days WHERE date = $1`,
    [date],
  );

  if (existing.length > 0) {
    const day = mapDay(existing[0]);
    if (day.deleted_at) {
      const ts = nowIso();
      await db.execute(
        `UPDATE days SET deleted_at = NULL, updated_at = $1, collapsed = 0 WHERE id = $2`,
        [ts, day.id],
      );
      return { ...day, deleted_at: null, updated_at: ts, collapsed: false };
    }
    return day;
  }

  const day: Day = {
    id: newId(),
    date,
    collapsed: false,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  };

  await db.execute(
    `INSERT INTO days (id, date, collapsed, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [day.id, day.date, 0, day.created_at, day.updated_at, null],
  );
  return day;
}

export async function toggleDayCollapsed(
  id: string,
  collapsed: boolean,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE days SET collapsed = $1, updated_at = $2 WHERE id = $3`,
    [collapsed ? 1 : 0, nowIso(), id],
  );
}

export async function deleteDay(id: string): Promise<void> {
  const db = await getDb();
  const ts = nowIso();
  await db.execute(`UPDATE days SET deleted_at = $1, updated_at = $1 WHERE id = $2`, [
    ts,
    id,
  ]);
  await db.execute(
    `UPDATE tasks SET deleted_at = $1, updated_at = $1 WHERE day_id = $2 AND deleted_at IS NULL`,
    [ts, id],
  );
}

export async function createTask(input: {
  dayId: string;
  title: string;
  units: number;
  comment?: string;
}): Promise<Task> {
  const db = await getDb();
  const maxRows = await db.select<{ max_order: number | null }[]>(
    `SELECT MAX(sort_order) as max_order FROM tasks WHERE day_id = $1 AND deleted_at IS NULL`,
    [input.dayId],
  );
  const sortOrder = Number(maxRows[0]?.max_order ?? -1) + 1;
  const ts = nowIso();
  const task: Task = {
    id: newId(),
    day_id: input.dayId,
    title: input.title.trim(),
    units: Math.max(1, Math.floor(input.units)),
    comment: input.comment?.trim() ? input.comment.trim() : null,
    completed: false,
    sort_order: sortOrder,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };

  await db.execute(
    `INSERT INTO tasks
      (id, day_id, title, units, comment, completed, sort_order, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      task.id,
      task.day_id,
      task.title,
      task.units,
      task.comment,
      0,
      task.sort_order,
      task.created_at,
      task.updated_at,
      null,
    ],
  );
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<Task, "title" | "units" | "comment" | "completed" | "sort_order">
  >,
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM tasks WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return;
  const current = mapTask(rows[0]);
  const next = {
    title: patch.title ?? current.title,
    units: patch.units ?? current.units,
    comment:
      patch.comment !== undefined
        ? patch.comment?.trim()
          ? patch.comment.trim()
          : null
        : current.comment,
    completed: patch.completed ?? current.completed,
    sort_order: patch.sort_order ?? current.sort_order,
  };

  await db.execute(
    `UPDATE tasks
     SET title = $1, units = $2, comment = $3, completed = $4, sort_order = $5, updated_at = $6
     WHERE id = $7`,
    [
      next.title,
      Math.max(1, Math.floor(next.units)),
      next.comment,
      next.completed ? 1 : 0,
      next.sort_order,
      nowIso(),
      id,
    ],
  );
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  const ts = nowIso();
  await db.execute(
    `UPDATE tasks SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
    [ts, id],
  );
}

export async function upsertDayFromSync(day: Day): Promise<void> {
  const db = await getDb();
  let next = day;

  // If another day row owns the same calendar date, keep the newer one.
  const sameDate = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM days WHERE date = $1 AND id != $2`,
    [next.date, next.id],
  );
  for (const row of sameDate) {
    const other = mapDay(row);
    if (next.updated_at >= other.updated_at) {
      await db.execute(
        `UPDATE days SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
        [next.updated_at, other.id],
      );
    } else if (!next.deleted_at) {
      next = { ...next, deleted_at: other.updated_at };
    }
  }

  await db.execute(
    `INSERT INTO days (id, date, collapsed, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       date = excluded.date,
       collapsed = excluded.collapsed,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [
      next.id,
      next.date,
      next.collapsed ? 1 : 0,
      next.created_at,
      next.updated_at,
      next.deleted_at,
    ],
  );
}

export async function upsertTaskFromSync(task: Task): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO tasks
      (id, day_id, title, units, comment, completed, sort_order, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       day_id = excluded.day_id,
       title = excluded.title,
       units = excluded.units,
       comment = excluded.comment,
       completed = excluded.completed,
       sort_order = excluded.sort_order,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at`,
    [
      task.id,
      task.day_id,
      task.title,
      task.units,
      task.comment,
      task.completed ? 1 : 0,
      task.sort_order,
      task.created_at,
      task.updated_at,
      task.deleted_at,
    ],
  );
}

export async function searchTasks(query: string): Promise<Task[]> {
  const q = query.trim().toLowerCase();
  if (!q) return listAllTasks();
  const db = await getDb();
  const rows = await db.select<Record<string, unknown>[]>(
    `SELECT * FROM tasks
     WHERE deleted_at IS NULL
       AND (
         lower(title) LIKE $1
         OR lower(COALESCE(comment, '')) LIKE $1
       )
     ORDER BY updated_at DESC`,
    [`%${q}%`],
  );
  return rows.map(mapTask);
}
