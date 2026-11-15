"use client";

import { useRef, useState } from "react";
import { weekdayName } from "@/lib/scheduler";
import type { ISODate, Task } from "@/lib/types";

type Status = { kind: "idle" } | { kind: "reading" } | { kind: "error"; message: string };

export default function SyllabusDrop({
  startDate,
  onImport,
}: {
  startDate: ISODate;
  onImport: (tasks: Task[], replace: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [found, setFound] = useState<{ tasks: Task[]; skippedPast: number } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function extract(payload: { file?: File; text?: string }) {
    setStatus({ kind: "reading" });
    setFound(null);
    const form = new FormData();
    form.set("startDate", startDate);
    if (payload.file) form.set("file", payload.file);
    if (payload.text) form.set("text", payload.text);
    try {
      const res = await fetch("/api/syllabus", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server said ${res.status}`);
      setFound(data);
      setPicked(new Set(data.tasks.map((t: Task) => t.id)));
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  function addPicked() {
    if (!found) return;
    onImport(found.tasks.filter((t) => picked.has(t.id)), replace);
    setFound(null);
    setText("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-slate-400 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-600 hover:text-slate-900"
      >
        Drop a syllabus
      </button>
    );
  }

  return (
    <section className="w-full rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Syllabus drop</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-800">
          Close
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) extract({ file });
        }}
        onClick={() => fileInput.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <svg viewBox="0 0 24 24" className="mb-1 h-7 w-7 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="font-medium">Drag a syllabus PDF here</div>
        <div className="text-xs text-slate-500">or click to choose a file</div>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) extract({ file });
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or paste the syllabus schedule here"
          rows={3}
          className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          disabled={!text.trim() || status.kind === "reading"}
          onClick={() => extract({ text })}
          className="mt-1 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          Extract deadlines
        </button>
      </div>

      {status.kind === "reading" && (
        <p className="mt-3 animate-pulse text-sm text-slate-600">Gemini is reading your syllabus…</p>
      )}
      {status.kind === "error" && <p className="mt-3 text-sm text-red-600">{status.message}</p>}

      {found && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-slate-600">
            Found <b>{found.tasks.length}</b> upcoming deadline{found.tasks.length === 1 ? "" : "s"}
            {found.skippedPast > 0 && ` (skipped ${found.skippedPast} already past)`}.
          </p>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {found.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={picked.has(t.id)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(t.id);
                    else next.delete(t.id);
                    setPicked(next);
                  }}
                  aria-label={`Include ${t.title}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    <span className="text-slate-500">{t.course}</span> · {t.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {weekdayName(t.dueDate).slice(0, 3)} {t.dueDate} · {t.estimatedHours}h · {t.priority}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              disabled={picked.size === 0}
              onClick={addPicked}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
            >
              Add {picked.size} to my schedule
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              Replace current tasks
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
