"use client";

import { useState } from "react";
import type { DaySchedule, ISODate, StressLevel, Task } from "@/lib/types";
import { weekdayName } from "@/lib/scheduler";

export const LEVEL_STYLE: Record<StressLevel, { bg: string; label: string }> = {
  free: { bg: "#f1f5f9", label: "Free" },
  calm: { bg: "#bbf7d0", label: "Calm" },
  busy: { bg: "#fde68a", label: "Busy" },
  heavy: { bg: "#fdba74", label: "Heavy" },
  overloaded: { bg: "#fca5a5", label: "Overloaded" },
};

const COURSE_COLORS = ["#6366f1", "#0ea5e9", "#14b8a6", "#f59e0b", "#ec4899", "#8b5cf6", "#84cc16", "#f97316"];
export function courseColor(course: string) {
  let h = 0;
  for (const ch of course) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_COLORS[h % COURSE_COLORS.length];
}

/** Drag payload type for moving a deadline. */
export const DRAG_TYPE = "application/x-deadline-task";

const RIPPLE_STEP_MS = 130;

export default function Heatmap({
  days,
  tasks,
  week,
  onWeekChange,
  ripple,
  onMoveDeadline,
}: {
  days: DaySchedule[];
  tasks: Task[];
  week: number;
  onWeekChange: (week: number) => void;
  ripple: { origin: number; key: number };
  onMoveDeadline: (taskId: string, date: ISODate) => void;
}) {
  const [dropTarget, setDropTarget] = useState<ISODate | null>(null);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const weeks = Math.max(1, Math.ceil(days.length / 7));
  const start = week * 7;
  const visible = days.slice(start, start + 7);

  return (
    <section aria-label="Weekly stress forecast">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Weekly stress forecast</h2>
          {weeks > 1 && (
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => onWeekChange(week - 1)}
                disabled={week === 0}
                className="rounded px-2 py-0.5 hover:bg-slate-200 disabled:opacity-30"
                aria-label="Previous week"
              >
                ‹
              </button>
              <span className="tabular-nums text-slate-600">
                Week {week + 1}/{weeks}
              </span>
              <button
                onClick={() => onWeekChange(week + 1)}
                disabled={week >= weeks - 1}
                className="rounded px-2 py-0.5 hover:bg-slate-200 disabled:opacity-30"
                aria-label="Next week"
              >
                ›
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          {Object.values(LEVEL_STYLE).map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-sm border border-black/10" style={{ background: l.bg }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[760px] grid-cols-7 gap-2">
          {visible.map((day, j) => {
            const i = start + j;
            const weekday = weekdayName(day.date);
            const delay = `${Math.abs(i - ripple.origin) * RIPPLE_STEP_MS}ms`;
            const style = LEVEL_STYLE[day.level];
            const due = tasks.filter((t) => !t.done && t.dueDate === day.date);
            const isDrop = dropTarget === day.date;
            return (
              <div
                key={day.date}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDropTarget(day.date);
                }}
                onDragLeave={() => setDropTarget((d) => (d === day.date ? null : d))}
                onDrop={(e) => {
                  const taskId = e.dataTransfer.getData(DRAG_TYPE);
                  setDropTarget(null);
                  if (taskId) {
                    e.preventDefault();
                    onMoveDeadline(taskId, day.date);
                  }
                }}
                className={`relative flex flex-col overflow-hidden rounded-xl border p-2.5 shadow-sm ${
                  isDrop ? "border-indigo-500 ring-2 ring-indigo-300" : "border-black/10"
                }`}
                style={{ backgroundColor: style.bg, transition: "background-color 600ms ease", transitionDelay: delay }}
              >
                {ripple.key > 0 && (
                  <span key={ripple.key} className="ripple-flash pointer-events-none absolute inset-0" style={{ animationDelay: delay }} />
                )}
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{weekday.slice(0, 3)}</span>
                  <span className="text-xs text-slate-600">{day.date.slice(5).replace("-", "/")}</span>
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">
                  {day.hoursScheduled}
                  <span className="text-sm font-normal text-slate-600">/{day.hoursFree}h</span>
                </div>
                <div className="text-xs font-medium text-slate-700">{style.label}</div>

                {due.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {due.map((t) => (
                      <li
                        key={t.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(DRAG_TYPE, t.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className="cursor-grab truncate rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white active:cursor-grabbing"
                        title={`${t.course}: ${t.title} is due. Drag to move the deadline.`}
                      >
                        Due: {t.course}
                      </li>
                    ))}
                  </ul>
                )}

                <ul className="mt-2 flex-1 space-y-1">
                  {day.blocks.map((b) => {
                    const t = byId.get(b.taskId);
                    return (
                      <li
                        key={b.taskId}
                        className="truncate rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] leading-tight"
                        style={{ borderLeft: `3px solid ${courseColor(t?.course ?? "")}` }}
                        title={t ? `${t.course}: ${t.title}` : b.taskId}
                      >
                        <span className="font-semibold">{t?.course}</span> {b.hours}h
                      </li>
                    );
                  })}
                  {day.overflowHours > 0 && (
                    <li className="rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      +{day.overflowHours}h won&apos;t fit
                    </li>
                  )}
                </ul>

                <div className="mt-auto pt-2" title={`Energy left after this day: ${day.energy}%`}>
                  <div className="h-1.5 w-full rounded-full bg-black/10">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${day.energy}%`,
                        background: day.energy > 60 ? "#16a34a" : day.energy > 30 ? "#f59e0b" : "#dc2626",
                      }}
                    />
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Tip: drag a dark &quot;Due&quot; tag to another day to move that deadline. The thin bar at the bottom of each day is your energy left after that day.</p>
    </section>
  );
}
