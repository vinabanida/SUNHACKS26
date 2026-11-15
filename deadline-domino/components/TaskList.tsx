"use client";

import { RISK_LABEL, weekdayName } from "@/lib/scheduler";
import type { ISODate, Risk, ScheduleResult, Task } from "@/lib/types";
import { courseColor, DRAG_TYPE } from "./Heatmap";

const RISK_STYLE: Record<Risk, string> = {
  safe: "bg-green-100 text-green-800",
  tight: "bg-amber-100 text-amber-800",
  "at-risk": "bg-red-100 text-red-800",
};

export default function TaskList({
  tasks,
  before,
  after,
  onMoveDeadline,
}: {
  tasks: Task[];
  before: ScheduleResult;
  after: ScheduleResult;
  onMoveDeadline: (taskId: string, date: ISODate) => void;
}) {
  const beforeById = new Map(before.tasks.map((t) => [t.taskId, t]));
  const byId = new Map(tasks.map((t) => [t.id, t]));

  if (after.tasks.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-lg font-semibold">Deadlines</h2>
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          No deadlines yet. Drop a syllabus to fill your week.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">Deadlines</h2>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {after.tasks.map((r) => {
          const t = byId.get(r.taskId);
          if (!t) return null;
          const prev = beforeById.get(r.taskId);
          const changed = !prev || prev.risk !== r.risk;
          return (
            <li
              key={r.taskId}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, t.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
            >
              <span className="h-8 w-1 cursor-grab rounded-full" style={{ background: courseColor(t.course) }} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  <span className="text-slate-500">{t.course}</span> · {t.title}
                </div>
                <div className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
                  <span>Due {weekdayName(t.dueDate).slice(0, 3)}</span>
                  <input
                    type="date"
                    value={t.dueDate}
                    onChange={(e) => e.target.value && onMoveDeadline(t.id, e.target.value)}
                    className="rounded border border-transparent bg-transparent px-1 text-xs text-slate-600 hover:border-slate-300 focus:border-slate-400 focus:outline-none"
                    aria-label={`Due date for ${t.title}`}
                  />
                  <span>
                    · {r.hoursScheduled}/{r.hoursNeeded}h planned
                  </span>
                  {r.hoursShort > 0 && <span className="font-semibold text-red-600">· {r.hoursShort}h short</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {changed && (
                  <span className="text-xs text-slate-400 line-through">{prev ? RISK_LABEL[prev.risk] : "new"}</span>
                )}
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RISK_STYLE[r.risk]} ${changed ? "pop-in" : ""}`}>
                  {RISK_LABEL[r.risk]}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
