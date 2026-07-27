import type { Day, Task } from "../types";

type Props = {
  days: Day[];
  tasksByDay: Record<string, Task[]>;
  selectedDayId: string | null;
  completedCount: number;
  newDate: string;
  onNewDateChange: (value: string) => void;
  onAddDay: () => void;
  onSelectDay: (id: string) => void;
  onToggleCollapse: (day: Day) => void;
  onDeleteDay: (day: Day) => void;
};

function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DayList({
  days,
  tasksByDay,
  selectedDayId,
  completedCount,
  newDate,
  onNewDateChange,
  onAddDay,
  onSelectDay,
  onToggleCollapse,
  onDeleteDay,
}: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <h1 className="brand">Daily Planner</h1>
        <p className="brand-sub">Plan the day, one block at a time.</p>

        <form
          className="add-day"
          onSubmit={(e) => {
            e.preventDefault();
            onAddDay();
          }}
        >
          <label htmlFor="new-day">Add day</label>
          <div className="add-day-row">
            <input
              id="new-day"
              type="date"
              value={newDate}
              onChange={(e) => onNewDateChange(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </div>
        </form>
      </div>

      <div className="day-scroll">
        {days.length === 0 ? (
          <p className="empty-hint">No days yet. Add one above.</p>
        ) : (
          days.map((day) => {
            const tasks = tasksByDay[day.id] ?? [];
            const isSelected = day.id === selectedDayId;
            return (
              <div
                key={day.id}
                className={`day-item ${isSelected ? "selected" : ""}`}
              >
                <div className="day-item-header">
                  <button
                    type="button"
                    className="collapse-btn"
                    aria-label={day.collapsed ? "Expand day" : "Collapse day"}
                    onClick={() => onToggleCollapse(day)}
                  >
                    <span className={`chevron ${day.collapsed ? "" : "open"}`}>
                      ›
                    </span>
                  </button>
                  <button
                    type="button"
                    className="day-label"
                    onClick={() => onSelectDay(day.id)}
                  >
                    <span>{formatDayLabel(day.date)}</span>
                    <span className="day-count">{tasks.length}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label="Delete day"
                    onClick={() => onDeleteDay(day)}
                  >
                    ×
                  </button>
                </div>
                {!day.collapsed && (
                  <ul className="day-task-preview">
                    {tasks.length === 0 ? (
                      <li className="muted">No tasks</li>
                    ) : (
                      tasks.map((task) => (
                        <li
                          key={task.id}
                          className={task.completed ? "done" : ""}
                          onClick={() => onSelectDay(day.id)}
                        >
                          <span className="preview-check">
                            {task.completed ? "✓" : "○"}
                          </span>
                          <span className="preview-title">{task.title}</span>
                          <span className="preview-units">{task.units}u</span>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      <footer className="sidebar-footer">
        <span>Completed tasks</span>
        <strong>{completedCount}</strong>
      </footer>
    </aside>
  );
}
