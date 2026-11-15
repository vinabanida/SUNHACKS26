"use client";

import { useState } from "react";
import { addDays, WEEKDAY_SHORT, type WeekTemplate } from "@/lib/scheduler";
import type { ISODate, Priority, Task } from "@/lib/types";
import { courseColor } from "./Heatmap";

const NEW_CLASS = "__new__";
const inputCls =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none";

export default function ClassesPanel({
  courses,
  week,
  startDate,
  defaultOpen,
  onAddCourse,
  onRemoveCourse,
  onAddTask,
  onWeekChange,
  onStartFresh,
  onLoadDemo,
}: {
  courses: string[];
  week: WeekTemplate;
  startDate: ISODate;
  defaultOpen: boolean;
  onAddCourse: (course: string) => void;
  onRemoveCourse: (course: string) => void;
  onAddTask: (task: Task) => void;
  onWeekChange: (weekday: number, hours: number) => void;
  onStartFresh: () => void;
  onLoadDemo: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [newCourse, setNewCourse] = useState("");

  const [title, setTitle] = useState("");
  const [course, setCourse] = useState(courses[0] ?? NEW_CLASS);
  const [typedCourse, setTypedCourse] = useState("");
  const [due, setDue] = useState<ISODate>(addDays(startDate, 7));
  const [hours, setHours] = useState("3");
  const [priority, setPriority] = useState<Priority>("medium");
  const [error, setError] = useState<string | null>(null);

  // Keep the class picker valid if classes change.
  const selectedCourse = course === NEW_CLASS || courses.includes(course) ? course : (courses[0] ?? NEW_CLASS);

  function addCourse() {
    const c = newCourse.trim().replace(/\s+/g, " ");
    if (!c) return;
    onAddCourse(c);
    setCourse(c);
    setNewCourse("");
  }

  function addTask() {
    const c = (selectedCourse === NEW_CLASS ? typedCourse : selectedCourse).trim().replace(/\s+/g, " ");
    const h = Number(hours);
    if (!title.trim()) return setError("Give the assignment a name.");
    if (!c) return setError("Pick or type a class.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return setError("Pick a due date.");
    if (!(h > 0 && h <= 100)) return setError("Hours should be between 0.5 and 100.");
    setError(null);
    if (selectedCourse === NEW_CLASS) {
      onAddCourse(c);
      setCourse(c);
      setTypedCourse("");
    }
    onAddTask({
      id: `${c}-${title}-${due}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: title.trim(),
      course: c,
      dueDate: due,
      estimatedHours: Math.round(h * 2) / 2,
      priority,
      done: false,
    });
    setTitle("");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-lg font-semibold">Your classes &amp; assignments</span>
        <span className="text-sm text-slate-500">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-slate-100 px-4 py-4">
          {/* Classes */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Classes</h3>
            <div className="flex flex-wrap items-center gap-2">
              {courses.map((c) => (
                <span
                  key={c}
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-0.5 pl-2.5 pr-1 text-sm"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: courseColor(c) }} />
                  {c}
                  <button
                    onClick={() => onRemoveCourse(c)}
                    className="rounded-full px-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    aria-label={`Remove ${c}`}
                    title={`Remove ${c} and its assignments`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  addCourse();
                }}
              >
                <input
                  value={newCourse}
                  onChange={(e) => setNewCourse(e.target.value)}
                  placeholder="Add a class, e.g. CSE 310"
                  className={`${inputCls} w-48`}
                  aria-label="New class name"
                />
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:border-slate-500">
                  Add
                </button>
              </form>
            </div>
          </div>

          {/* Add assignment */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Add an assignment, quiz or exam</h3>
            <form
              className="grid gap-2 sm:grid-cols-[1fr_auto_auto] lg:grid-cols-[2fr_1.2fr_auto_auto_auto_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                addTask();
              }}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name, e.g. Homework 6"
                className={inputCls}
                aria-label="Assignment name"
              />
              {selectedCourse === NEW_CLASS ? (
                <div className="flex gap-1">
                  <input
                    value={typedCourse}
                    onChange={(e) => setTypedCourse(e.target.value)}
                    placeholder="Class"
                    className={`${inputCls} min-w-0 flex-1`}
                    aria-label="Class for this assignment"
                  />
                  {courses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCourse(courses[0])}
                      className="px-1 text-xs text-slate-500 hover:text-slate-800"
                    >
                      list
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={selectedCourse}
                  onChange={(e) => setCourse(e.target.value)}
                  className={inputCls}
                  aria-label="Class for this assignment"
                >
                  {courses.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value={NEW_CLASS}>New class…</option>
                </select>
              )}
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} aria-label="Due date" />
              <label className="flex items-center gap-1 text-sm text-slate-600">
                <input
                  type="number"
                  min={0.5}
                  max={100}
                  step={0.5}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className={`${inputCls} w-16`}
                  aria-label="Estimated hours"
                />
                h
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className={inputCls}
                aria-label="Priority"
              >
                <option value="high">High priority</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <button className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">
                Add
              </button>
            </form>
            {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
          </div>

          {/* Typical week */}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-slate-700">Free hours in a normal week</h3>
            <p className="mb-2 text-xs text-slate-500">
              How many hours you can usually spend on schoolwork each day. The day sliders on the calendar are for one-off what-ifs.
            </p>
            <div className="grid grid-cols-7 gap-2">
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <label key={dow} className="flex flex-col items-center gap-1 text-xs text-slate-600">
                  {WEEKDAY_SHORT[dow]}
                  <input
                    type="number"
                    min={0}
                    max={16}
                    step={0.5}
                    value={week[dow]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 0 && v <= 16) onWeekChange(dow, v);
                    }}
                    className={`${inputCls} w-full text-center`}
                    aria-label={`Free hours on ${WEEKDAY_SHORT[dow]}`}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-sm">
            <button onClick={onStartFresh} className="rounded-full border border-slate-300 px-3 py-1.5 font-medium hover:border-slate-500">
              Start my own plan (clear everything)
            </button>
            <button onClick={onLoadDemo} className="rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-100">
              Load demo week
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
