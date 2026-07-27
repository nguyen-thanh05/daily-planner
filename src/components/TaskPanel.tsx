import { useEffect, useState, type FormEvent } from "react";
import type { Day, Task } from "../types";

type Props = {
  day: Day | null;
  tasks: Task[];
  searchQuery: string;
  searchResults: Task[];
  dayLookup: Record<string, Day>;
  onSelectDay: (id: string) => void;
  onCreateTask: (input: {
    title: string;
    units: number;
    comment: string;
  }) => Promise<void>;
  onUpdateTask: (
    id: string,
    patch: Partial<Pick<Task, "title" | "units" | "comment" | "completed">>,
  ) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
};

function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function TaskRow({
  task,
  onUpdateTask,
  onDeleteTask,
}: {
  task: Task;
  onUpdateTask: Props["onUpdateTask"];
  onDeleteTask: Props["onDeleteTask"];
}) {
  const [title, setTitle] = useState(task.title);
  const [units, setUnits] = useState(String(task.units));
  const [comment, setComment] = useState(task.comment ?? "");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setUnits(String(task.units));
    setComment(task.comment ?? "");
  }, [task.id, task.title, task.units, task.comment]);

  async function commit() {
    const nextUnits = Math.max(1, Number.parseInt(units, 10) || 1);
    if (
      title.trim() === task.title &&
      nextUnits === task.units &&
      (comment.trim() || null) === task.comment
    ) {
      return;
    }
    await onUpdateTask(task.id, {
      title: title.trim() || task.title,
      units: nextUnits,
      comment,
    });
  }

  return (
    <article
      className={`task-row ${task.completed ? "completed" : ""} ${expanded ? "expanded" : ""}`}
    >
      <div className="task-main">
        <label className="check">
          <input
            type="checkbox"
            checked={task.completed}
            onChange={(e) =>
              onUpdateTask(task.id, { completed: e.target.checked })
            }
          />
        </label>
        <input
          className="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void commit()}
          aria-label="Task title"
        />
        <div className="task-units">
          <input
            type="number"
            min={1}
            step={1}
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            onBlur={() => void commit()}
            aria-label="Units"
          />
          <span className="unit-hint">u</span>
        </div>
        <button
          type="button"
          className="collapse-btn"
          aria-label={expanded ? "Collapse task" : "Expand task"}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className={`chevron ${expanded ? "open" : ""}`}>›</span>
        </button>
        <button
          type="button"
          className="icon-btn danger"
          aria-label="Delete task"
          onClick={() => void onDeleteTask(task.id)}
        >
          ×
        </button>
      </div>
      {expanded && (
        <label className="comment-field">
          Comment
          <input
            value={comment}
            placeholder="Optional"
            onChange={(e) => setComment(e.target.value)}
            onBlur={() => void commit()}
          />
        </label>
      )}
    </article>
  );
}

export function TaskPanel({
  day,
  tasks,
  searchQuery,
  searchResults,
  dayLookup,
  onSelectDay,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}: Props) {
  const [title, setTitle] = useState("");
  const [units, setUnits] = useState("1");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    setAdding(false);
    setTitle("");
    setUnits("1");
    setComment("");
  }, [day?.id]);

  function resetAddForm() {
    setTitle("");
    setUnits("1");
    setComment("");
    setAdding(false);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!day || !title.trim()) return;
    setSaving(true);
    try {
      await onCreateTask({
        title,
        units: Math.max(1, Number.parseInt(units, 10) || 1),
        comment,
      });
      resetAddForm();
    } finally {
      setSaving(false);
    }
  }

  if (isSearching) {
    return (
      <section className="main-panel">
        <header className="panel-header">
          <h2>Search results</h2>
          <p>
            {searchResults.length} match
            {searchResults.length === 1 ? "" : "es"} for “{searchQuery.trim()}”
          </p>
        </header>
        <div className="task-list">
          {searchResults.length === 0 ? (
            <p className="empty-hint">No matching tasks.</p>
          ) : (
            searchResults.map((task) => {
              const parent = dayLookup[task.day_id];
              return (
                <div key={task.id} className="search-result">
                  {parent && (
                    <button
                      type="button"
                      className="result-day"
                      onClick={() => onSelectDay(parent.id)}
                    >
                      {formatDayLabel(parent.date)}
                    </button>
                  )}
                  <TaskRow
                    task={task}
                    onUpdateTask={onUpdateTask}
                    onDeleteTask={onDeleteTask}
                  />
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  }

  if (!day) {
    return (
      <section className="main-panel empty-main">
        <h2>Select a day</h2>
        <p>Choose a day on the left, or add a new one to start planning.</p>
      </section>
    );
  }

  return (
    <section className="main-panel">
      <header className="panel-header">
        <h2>{formatDayLabel(day.date)}</h2>
        <p>
          {tasks.length} task{tasks.length === 1 ? "" : "s"} ·{" "}
          {tasks.reduce((sum, t) => sum + t.units, 0)} units (
          {tasks.reduce((sum, t) => sum + t.units, 0) * 0.5}h)
        </p>
      </header>

      {adding ? (
        <form className="add-task" onSubmit={(e) => void handleCreate(e)}>
          <div className="add-task-grid">
            <label>
              Task
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs doing?"
                required
                autoFocus
              />
            </label>
            <label>
              Units
              <input
                type="number"
                min={1}
                step={1}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
              />
            </label>
            <label className="span-2">
              Comment
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional note"
              />
            </label>
          </div>
          <div className="btn-row">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || !title.trim()}
            >
              Add task
            </button>
            <button
              type="button"
              className="btn"
              onClick={resetAddForm}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn btn-primary add-task-toggle"
          onClick={() => setAdding(true)}
        >
          Add task
        </button>
      )}

      <div className="task-list">
        {tasks.length === 0 ? (
          <p className="empty-hint">No tasks for this day yet.</p>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onUpdateTask={onUpdateTask}
              onDeleteTask={onDeleteTask}
            />
          ))
        )}
      </div>
    </section>
  );
}
