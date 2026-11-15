"use client";

import { useState } from "react";
import { RISK_LABEL, weekdayName } from "@/lib/scheduler";
import type { ISODate, Priority, Risk, ScheduleResult, Task } from "@/lib/types";
import { courseColor, DRAG_TYPE } from "./Heatmap";

const RISK_STYLE: Record<Risk, string> = {
  safe: "bg-green-100 text-green-800",
  tight: "bg-amber-100 text-amber-800",
  "at-risk": "bg-red-100 text-red-800",
};
const inputCls = "rounded border border-slate-300 bg-white px-1.5 py-1 text-sm focus:border-slate-500 focus:outline-none";

export default function TaskList({
  tasks,
  courses,
  before,
  after,
  onMoveDeadline,
  onUpdateTask,
  onDeleteTask,
}: {
  tasks: Task[];
  courses: string[];
  before: ScheduleResult;
  after: ScheduleResult;
  onMoveDeadline: (taskId: string, date: ISODate) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const beforeById = new Map(before.tasks.map((t) => [t.taskId, t]));
  const afterById = new Map(after.tasks.map((t) => [t.taskId, t]));
  const byDate = (a: Task, b: Task) => a.dueDate.localeCompare(b.dueDate);
  const todo = tasks.filter((t) => !t.done).sort(byDate);
  const completed = tasks.filter((t) => t.done).sort(byDate);

  const renderRow = (t: Task) => {
    const r = afterById.get(t.id);
    const prev = beforeById.get(t.id);
    const changed = r && (!prev || prev.risk !== r.risk);

    if (editing === t.id) {
      return (
        <EditRow
          key={t.id}
          task={t}
          courses={courses}
          onSave={(patch) => {
            onUpdateTask(t.id, patch);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      );
    }

    return (
      <li
        key={t.id}
        draggable={!t.done}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, t.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
      >
        <input
          type="checkbox"
          checked={t.done}
          onChange={(e) => onUpdateTask(t.id, { done: e.target.checked })}
          className="h-4 w-4 accent-slate-800"
          aria-label={t.done ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
          title={t.done ? "Mark not done" : "Mark done"}
        />
        <span className="h-8 w-1 rounded-full" style={{ background: courseColor(t.course), opacity: t.done ? 0.3 : 1 }} />
        <div className="min-w-0 flex-1">
          <div className={`truncate font-medium ${t.done ? "text-slate-400 line-through" : ""}`}>
            <span className={t.done ? "" : "text-slate-500"}>{t.course}</span> · {t.title}
          </div>
          <div className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
            {t.done ? (
              <span>
                Was due {weekdayName(t.dueDate).slice(0, 3)} {t.dueDate.slice(5).replace("-", "/")} · {t.estimatedHours}h
              </span>
            ) : (
              <>
                <span>Due {weekdayName(t.dueDate).slice(0, 3)}</span>
                <input
                  type="date"
                  value={t.dueDate}
                  onChange={(e) => e.target.value && onMoveDeadline(t.id, e.target.value)}
                  className="rounded border border-transparent bg-transparent px-1 text-xs text-slate-600 hover:border-slate-300 focus:border-slate-400 focus:outline-none"
                  aria-label={`Due date for ${t.title}`}
                />
                {r && (
                  <span>
                    · {r.hoursScheduled}/{r.hoursNeeded}h planned · {t.priority}
                  </span>
                )}
                {r && r.hoursShort > 0 && <span className="font-semibold text-red-600">· {r.hoursShort}h short</span>}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {changed && <span className="text-xs text-slate-400 line-through">{prev ? RISK_LABEL[prev.risk] : "new"}</span>}
          {r && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RISK_STYLE[r.risk]} ${changed ? "pop-in" : ""}`}>
              {RISK_LABEL[r.risk]}
            </span>
          )}
          {!t.done && (
            <button onClick={() => setEditing(t.id)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              Edit
            </button>
          )}
          <button
            onClick={() => onDeleteTask(t.id)}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </li>
    );
  };

  const listCls = "divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm";
  const emptyCls = "rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500";

  return (
    <section className="space-y-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">Assignments</h2>
        {todo.length > 0 ? (
          <ul className={listCls}>{todo.map(renderRow)}</ul>
        ) : completed.length > 0 ? (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
            <div className="font-semibold text-green-900">You finished everything. Nice work!</div>
            <div className="mt-1 text-sm text-green-800">Every assignment is done. Get some sleep, you earned it.</div>
          </div>
        ) : (
          <p className={emptyCls}>No assignments yet. Add assignments under &quot;Your classes &amp; assignments&quot;, or drop a syllabus.</p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">
          Completed{completed.length > 0 && <span className="ml-1 text-sm font-normal text-slate-500">({completed.length})</span>}
        </h2>
        {completed.length > 0 ? (
          <ul className={listCls}>{completed.map(renderRow)}</ul>
        ) : (
          <p className={emptyCls}>No completed assignments yet. Get to work!</p>
        )}
      </div>
    </section>
  );
}

function EditRow({
  task,
  courses,
  onSave,
  onCancel,
}: {
  task: Task;
  courses: string[];
  onSave: (patch: Partial<Task>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [course, setCourse] = useState(task.course);
  const [due, setDue] = useState(task.dueDate);
  const [hours, setHours] = useState(String(task.estimatedHours));
  const [priority, setPriority] = useState<Priority>(task.priority);
  const options = courses.includes(task.course) ? courses : [task.course, ...courses];
  const h = Number(hours);
  const valid = title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(due) && h > 0 && h <= 100;

  return (
    <li className="bg-indigo-50/40 px-4 py-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSave({ title: title.trim(), course, dueDate: due, estimatedHours: Math.round(h * 2) / 2, priority });
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputCls} min-w-40 flex-1`} aria-label="Name" />
        <select value={course} onChange={(e) => setCourse(e.target.value)} className={inputCls} aria-label="Class">
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} aria-label="Due date" />
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="number" min={0.5} max={100} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className={`${inputCls} w-16`} aria-label="Hours" />h
        </label>
        <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls} aria-label="Priority">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button disabled={!valid} className="rounded bg-slate-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
      </form>
      <p className="mt-1 text-xs text-slate-500">Changing the date here changes the real deadline (not a what-if).</p>
    </li>
  );
}
