import { useCallback, useEffect, useMemo, useState } from "react";
import { DayList } from "./components/DayList";
import { SearchBar } from "./components/SearchBar";
import { Settings } from "./components/Settings";
import { TaskPanel } from "./components/TaskPanel";
import * as db from "./lib/db";
import { getLastSyncAt, getSyncFolder } from "./lib/settings";
import { syncNow } from "./lib/sync";
import type { Day, Task } from "./types";
import "./App.css";

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [newDate, setNewDate] = useState(todayIsoDate());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Task[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncFolder, setSyncFolderState] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAtState] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const refresh = useCallback(async (preferSelectedId?: string | null) => {
    const [nextDays, nextTasks, completed] = await Promise.all([
      db.listDays(),
      db.listAllTasks(),
      db.countCompletedTasks(),
    ]);
    setDays(nextDays);
    setTasks(nextTasks);
    setCompletedCount(completed);

    setSelectedDayId((current) => {
      const preferred = preferSelectedId ?? current;
      if (preferred && nextDays.some((d) => d.id === preferred)) {
        return preferred;
      }
      return nextDays[0]?.id ?? null;
    });
  }, []);

  const syncQuietly = useCallback(async () => {
    try {
      const result = await syncNow();
      await refresh();
      setLastSyncAtState(result.at);
      setSyncFolderState(result.folder);
      setSyncMessage(`Synced ${new Date(result.at).toLocaleTimeString()}`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : String(err));
    }
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const folder = await getSyncFolder();
        const last = await getLastSyncAt();
        if (!cancelled) {
          setSyncFolderState(folder);
          setLastSyncAtState(last);
        }

        if (folder) {
          try {
            const result = await syncNow();
            if (!cancelled) {
              setLastSyncAtState(result.at);
              setSyncMessage("Synced on launch");
            }
          } catch (err) {
            if (!cancelled) {
              setSyncMessage(
                err instanceof Error ? err.message : "Launch sync skipped",
              );
            }
          }
        }

        await refresh();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }
      const results = await db.searchTasks(searchQuery);
      if (!cancelled) setSearchResults(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [searchQuery, tasks]);

  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (!map[task.day_id]) map[task.day_id] = [];
      map[task.day_id].push(task);
    }
    for (const id of Object.keys(map)) {
      map[id].sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at),
      );
    }
    return map;
  }, [tasks]);

  const dayLookup = useMemo(() => {
    const map: Record<string, Day> = {};
    for (const day of days) map[day.id] = day;
    return map;
  }, [days]);

  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;
  const selectedTasks = selectedDay ? (tasksByDay[selectedDay.id] ?? []) : [];

  async function handleAddDay() {
    if (!newDate) return;
    const day = await db.createDay(newDate);
    await refresh(day.id);
    await syncQuietly();
  }

  async function handleToggleCollapse(day: Day) {
    await db.toggleDayCollapsed(day.id, !day.collapsed);
    await refresh(selectedDayId);
    await syncQuietly();
  }

  async function handleDeleteDay(day: Day) {
    const ok = window.confirm(
      `Delete ${day.date} and its tasks? This will sync as a deletion.`,
    );
    if (!ok) return;
    await db.deleteDay(day.id);
    await refresh(null);
    await syncQuietly();
  }

  async function handleCreateTask(input: {
    title: string;
    units: number;
    comment: string;
  }) {
    if (!selectedDay) return;
    await db.createTask({
      dayId: selectedDay.id,
      title: input.title,
      units: input.units,
      comment: input.comment,
    });
    await refresh(selectedDay.id);
    await syncQuietly();
  }

  async function handleUpdateTask(
    id: string,
    patch: Partial<Pick<Task, "title" | "units" | "comment" | "completed">>,
  ) {
    await db.updateTask(id, patch);
    await refresh(selectedDayId);
    await syncQuietly();
  }

  async function handleDeleteTask(id: string) {
    await db.deleteTask(id);
    await refresh(selectedDayId);
    await syncQuietly();
  }

  async function handleQuickSync() {
    try {
      const result = await syncNow();
      setLastSyncAtState(result.at);
      setSyncFolderState(result.folder);
      await refresh(selectedDayId);
      setSyncMessage(`Synced ${new Date(result.at).toLocaleTimeString()}`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : String(err));
      setSettingsOpen(true);
    }
  }

  if (error) {
    return (
      <div className="boot-error">
        <h1>Could not start</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="boot-loading">
        <p>Opening planner…</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <DayList
        days={days}
        tasksByDay={tasksByDay}
        selectedDayId={selectedDayId}
        completedCount={completedCount}
        newDate={newDate}
        onNewDateChange={setNewDate}
        onAddDay={() => void handleAddDay()}
        onSelectDay={setSelectedDayId}
        onToggleCollapse={(day) => void handleToggleCollapse(day)}
        onDeleteDay={(day) => void handleDeleteDay(day)}
      />

      <div className="workspace">
        <div className="workspace-toolbar">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <div className="toolbar-actions">
            {syncMessage && <span className="sync-pill">{syncMessage}</span>}
            <button
              type="button"
              className="btn"
              onClick={() => void handleQuickSync()}
            >
              Sync
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
          </div>
        </div>

        <TaskPanel
          day={selectedDay}
          tasks={selectedTasks}
          searchQuery={searchQuery}
          searchResults={searchResults}
          dayLookup={dayLookup}
          onSelectDay={setSelectedDayId}
          onCreateTask={handleCreateTask}
          onUpdateTask={handleUpdateTask}
          onDeleteTask={handleDeleteTask}
        />
      </div>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSynced={async () => {
          await refresh(selectedDayId);
        }}
        syncFolder={syncFolder}
        lastSyncAt={lastSyncAt}
        onSettingsChange={(folder, last) => {
          setSyncFolderState(folder);
          setLastSyncAtState(last);
        }}
      />
    </div>
  );
}

export default App;
