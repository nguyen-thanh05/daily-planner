export type Day = {
  id: string;
  date: string;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Task = {
  id: string;
  day_id: string;
  title: string;
  units: number;
  comment: string | null;
  completed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type SyncPayload = {
  version: 1;
  exported_at: string;
  days: Day[];
  tasks: Task[];
};

export type DayWithTasks = Day & { tasks: Task[] };
