"use client";

import { useEffect, useMemo, useState } from "react";
import { applyScenario, buildSchedule, presets, weekdayName } from "@/lib/scheduler";
import { demoAvailability, demoTasks } from "@/lib/demoData";
import type { ExplainResponse } from "@/lib/explain";
import type { Availability, ISODate, Scenario, ScenarioChange, Task } from "@/lib/types";
import Heatmap from "./Heatmap";
import TaskList from "./TaskList";
import OptionsPanel from "./OptionsPanel";
import SyllabusDrop from "./SyllabusDrop";
import Universes from "./Universes";
import EnergyMeter from "./EnergyMeter";

type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: ExplainResponse }
  | { status: "error"; message: string };

type DbState = "checking" | "none" | "ready" | "saving" | "saved" | "error";

/** A scenario label; `key` lets a newer edit of the same thing replace the old label. */
interface Label {
  key: string;
  text: string;
}

const PLAN_ID_KEY = "deadline-domino-plan-id";

function getPlanId(): string {
  try {
    let id = localStorage.getItem(PLAN_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAN_ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Which day a change "starts" on, so the ripple spreads out from there. */
function changeDate(c: ScenarioChange): ISODate | null {
  if (c.type === "setHours" || c.type === "loseHours") return c.date;
  if (c.type === "addTask") return c.task.dueDate;
  if (c.type === "moveDeadline") return c.newDueDate;
  return null;
}

export default function Planner() {
  const [tasks, setTasks] = useState<Task[]>(demoTasks);
  const [availability, setAvailability] = useState<Availability[]>(demoAvailability);
  const [changes, setChanges] = useState<ScenarioChange[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [ripple, setRipple] = useState<{ origin: number; key: number }>({ origin: 0, key: 0 });
  const [week, setWeek] = useState(0);
  const [explain, setExplain] = useState<ExplainState>({ status: "idle" });
  const [saved, setSaved] = useState<Scenario[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [db, setDb] = useState<DbState>("checking");

  const before = useMemo(() => buildSchedule(tasks, availability), [tasks, availability]);
  const plan = useMemo(() => applyScenario({ tasks, availability }, changes), [tasks, availability, changes]);
  const after = useMemo(() => buildSchedule(plan.tasks, plan.availability), [plan]);
  const scenarioName = labels.map((l) => l.text).join(" + ");

  // ---------- Load saved plan from MongoDB ----------
  useEffect(() => {
    const id = getPlanId();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/plan?id=${id}`);
        if (cancelled) return;
        setPlanId(id);
        if (res.status === 503) return setDb("none");
        if (res.status === 404) return setDb("ready");
        if (!res.ok) return setDb("error");
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
        if (Array.isArray(data.availability)) setAvailability(data.availability);
        if (Array.isArray(data.scenarios)) setSaved(data.scenarios);
        setDb("ready");
      } catch {
        if (!cancelled) setDb("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function persist(next: { tasks?: Task[]; availability?: Availability[]; scenarios?: Scenario[] } = {}) {
    if (!planId || db === "none" || db === "checking") return;
    setDb("saving");
    try {
      const res = await fetch("/api/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: planId,
          tasks: next.tasks ?? tasks,
          availability: next.availability ?? availability,
          scenarios: next.scenarios ?? saved,
        }),
      });
      setDb(res.ok ? "saved" : res.status === 503 ? "none" : "error");
    } catch {
      setDb("error");
    }
  }

  // ---------- Scenario edits ----------
  const startRipple = (date: ISODate | null, days = after.days) => {
    const idx = Math.max(0, date ? days.findIndex((d) => d.date === date) : 0);
    setRipple((r) => ({ origin: idx, key: r.key + 1 }));
    setWeek(Math.floor(idx / 7));
  };

  const addLabel = (label: Label) => setLabels((ls) => [...ls.filter((l) => l.key !== label.key), label]);

  const applyPreset = (scenario: Scenario) => {
    setChanges((cs) => [...cs, ...scenario.changes]);
    addLabel({ key: `preset:${scenario.name}`, text: scenario.name });
    startRipple(changeDate(scenario.changes[0]));
  };

  const setDayHours = (date: ISODate, hours: number) => {
    setChanges((cs) => [...cs.filter((c) => !(c.type === "setHours" && c.date === date)), { type: "setHours", date, hours }]);
    addLabel({ key: `hours:${date}`, text: `${weekdayName(date)} → ${hours}h free` });
    startRipple(date);
  };

  // Step 18: moving a deadline is a what-if (like getting an extension), so Gemini explains it too.
  const moveDeadline = (taskId: string, date: ISODate) => {
    const original = tasks.find((t) => t.id === taskId) ?? plan.tasks.find((t) => t.id === taskId);
    if (!original) return;
    const rest = changes.filter((c) => !(c.type === "moveDeadline" && c.taskId === taskId));
    const backToOriginal = tasks.some((t) => t.id === taskId && t.dueDate === date);
    setChanges(backToOriginal ? rest : [...rest, { type: "moveDeadline", taskId, newDueDate: date }]);
    if (backToOriginal) setLabels((ls) => ls.filter((l) => l.key !== `move:${taskId}`));
    else addLabel({ key: `move:${taskId}`, text: `${original.course} due ${weekdayName(date)}` });
    startRipple(date);
  };

  const reset = () => {
    setChanges([]);
    setLabels([]);
    setExplain({ status: "idle" });
    startRipple(null);
  };

  // Step 14: tasks from the syllabus drop.
  const importTasks = (incoming: Task[], replace: boolean) => {
    const existing = replace ? [] : tasks.filter((t) => !incoming.some((n) => n.id === t.id));
    const nextTasks = [...existing, ...incoming];
    setTasks(nextTasks);
    setChanges([]);
    setLabels([]);
    setExplain({ status: "idle" });
    const nextDays = buildSchedule(nextTasks, availability).days;
    const first = incoming.reduce<ISODate | null>((m, t) => (!m || t.dueDate < m ? t.dueDate : m), null);
    startRipple(first, nextDays);
    persist({ tasks: nextTasks });
  };

  const saveScenario = () => {
    if (!changes.length) return;
    const scenario: Scenario = {
      name: scenarioName || "My scenario",
      changes,
      explanation: explain.status === "done" ? explain.data.explanation : undefined,
    };
    const next = [...saved.filter((s) => s.name !== scenario.name), scenario];
    setSaved(next);
    persist({ scenarios: next });
  };

  const loadScenario = (s: Scenario) => {
    setChanges(s.changes);
    setLabels([{ key: "saved", text: s.name }]);
    startRipple(changeDate(s.changes[0]));
  };

  // Ask Gemini to explain whenever the scenario changes (debounced so sliders don't spam it).
  useEffect(() => {
    if (!changes.length) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setExplain({ status: "loading" });
      try {
        const res = await fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioName, tasks, availability, changes }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Server said ${res.status}`);
        setExplain({ status: "done", data: await res.json() });
      } catch (err) {
        if (!ctrl.signal.aborted) setExplain({ status: "error", message: String(err) });
      }
    }, 800);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [changes, scenarioName, tasks, availability]);

  const days = after.days;
  const firstWeekDays = days.slice(0, 7);
  const tue = firstWeekDays.find((d) => weekdayName(d.date) === "Tuesday")?.date;
  const thu = firstWeekDays.find((d) => weekdayName(d.date) === "Thursday")?.date;
  const fri = firstWeekDays.find((d) => weekdayName(d.date) === "Friday")?.date;
  const quizCourse = tasks[0]?.course ?? "CSE 340";
  const score = after.summary.survivalScore;
  const scoreDelta = score - before.summary.survivalScore;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-end gap-4">
        <div className="flex flex-wrap items-stretch gap-3">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-slate-500">Survival score</div>
            <div className="text-2xl font-bold tabular-nums">
              {score}
              {scoreDelta !== 0 && (
                <span className={`ml-1 text-sm ${scoreDelta < 0 ? "text-red-600" : "text-green-600"}`}>
                  {scoreDelta > 0 ? "+" : ""}
                  {scoreDelta}
                </span>
              )}
            </div>
          </div>
          <EnergyMeter days={days} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section className="flex flex-wrap items-center gap-2">
            {tue && <ScenarioButton onClick={() => applyPreset(presets.sickDay(tue))}>Sick Tuesday</ScenarioButton>}
            {fri && (
              <ScenarioButton onClick={() => applyPreset(presets.surpriseQuiz(fri, quizCourse, 3))}>
                Surprise quiz Friday
              </ScenarioButton>
            )}
            {thu && <ScenarioButton onClick={() => applyPreset(presets.workShift(thu, 3))}>Work picked up a shift</ScenarioButton>}
            <SyllabusDrop startDate={days[0]?.date ?? demoAvailability[0].date} onImport={importTasks} />
            {changes.length > 0 && (
              <button onClick={reset} className="ml-auto rounded-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Reset
              </button>
            )}
          </section>

          {(labels.length > 0 || saved.length > 0) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {labels.length > 0 && (
                <>
                  <span className="text-slate-600">
                    Scenario: <span className="font-medium text-slate-900">{scenarioName}</span>
                  </span>
                  {db !== "none" && (
                    <button onClick={saveScenario} className="rounded-full px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
                      Save scenario
                    </button>
                  )}
                </>
              )}
              {saved.length > 0 && (
                <span className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-slate-500">Saved:</span>
                  {saved.map((s) => (
                    <button
                      key={s.name}
                      onClick={() => loadScenario(s)}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs hover:border-slate-400"
                    >
                      {s.name}
                    </button>
                  ))}
                </span>
              )}
            </div>
          )}

          <Heatmap
            days={days}
            tasks={plan.tasks}
            week={week}
            onWeekChange={setWeek}
            ripple={ripple}
            onHoursChange={setDayHours}
            onMoveDeadline={moveDeadline}
          />
          <TaskList tasks={plan.tasks} before={before} after={after} onMoveDeadline={moveDeadline} />
          <Universes plan={plan} />
          <DbStatus state={db} onSave={() => persist()} />
        </div>

        <OptionsPanel state={explain} hasChanges={changes.length > 0} />
      </div>
    </div>
  );
}

function ScenarioButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow active:translate-y-0"
    >
      {children}
    </button>
  );
}

function DbStatus({ state, onSave }: { state: DbState; onSave: () => void }) {
  const text: Record<DbState, string> = {
    checking: "Connecting to database…",
    none: "Not saving: no database connected (add MONGODB_URI to .env.local).",
    ready: "Connected to MongoDB.",
    saving: "Saving…",
    saved: "Saved to MongoDB.",
    error: "Couldn't reach the database.",
  };
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span>{text[state]}</span>
      {(state === "ready" || state === "saved" || state === "error") && (
        <button onClick={onSave} className="rounded-full border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:border-slate-500">
          Save tasks
        </button>
      )}
    </div>
  );
}
