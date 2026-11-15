"use client";

import { useEffect, useMemo, useState } from "react";
import {
  applyScenario,
  buildSchedule,
  dayOfWeek,
  DEFAULT_WEEK,
  extendAvailability,
  todayISO,
  weekdayName,
  type WeekTemplate,
} from "@/lib/scheduler";
import { demoAvailability, demoTasks } from "@/lib/demoData";
import type { ExplainResponse } from "@/lib/explain";
import type { Availability, ISODate, Scenario, ScenarioChange, Task } from "@/lib/types";
import Heatmap from "./Heatmap";
import TaskList from "./TaskList";
import OptionsPanel from "./OptionsPanel";
import SyllabusDrop from "./SyllabusDrop";
import Universes from "./Universes";
import EnergyMeter from "./EnergyMeter";
import ClassesPanel from "./ClassesPanel";

type ExplainState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: ExplainResponse }
  | { status: "error"; message: string };

type DbState = "checking" | "none" | "ready" | "saving" | "saved" | "error";

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

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
  const [courses, setCourses] = useState<string[]>([]);
  const [weekTemplate, setWeekTemplate] = useState<WeekTemplate>(DEFAULT_WEEK);
  const [loaded, setLoaded] = useState(false);
  // Read the clock only in the browser (after mount), never during prerender.
  const [today, setToday] = useState<ISODate>(demoAvailability[0].date);

  const allCourses = useMemo(() => uniq([...courses, ...tasks.map((t) => t.course)]), [courses, tasks]);
  // Your explicit days + your typical week for every other day through the last deadline.
  const baseAvailability = useMemo(
    () => extendAvailability(availability, weekTemplate, tasks, availability.length ? undefined : today),
    [availability, weekTemplate, tasks, today],
  );
  const before = useMemo(() => buildSchedule(tasks, baseAvailability), [tasks, baseAvailability]);
  const plan = useMemo(
    () => applyScenario({ tasks, availability: baseAvailability }, changes),
    [tasks, baseAvailability, changes],
  );
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
        if (Array.isArray(data.scenarios))
          // Only deadline moves are what-ifs now; drop old preset scenarios (sick day, quiz, shift).
          setSaved(data.scenarios.filter((sc: Scenario) => sc.changes.every((c) => c.type === "moveDeadline")));
        if (Array.isArray(data.courses)) setCourses(data.courses);
        if (Array.isArray(data.weekTemplate) && data.weekTemplate.length === 7) setWeekTemplate(data.weekTemplate);
        setDb("ready");
      } catch {
        if (!cancelled) setDb("error");
      } finally {
        if (!cancelled) {
          setToday(todayISO());
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Autosave everything you enter (debounced). Waits for the first load so it never
  // overwrites your saved plan with the demo data.
  const canSave = loaded && planId !== null && db !== "none" && db !== "checking";
  useEffect(() => {
    if (!canSave) return;
    const timer = setTimeout(async () => {
      setDb("saving");
      try {
        const res = await fetch("/api/plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: planId, tasks, availability, scenarios: saved, courses, weekTemplate }),
        });
        setDb(res.ok ? "saved" : res.status === 503 ? "none" : "error");
      } catch {
        setDb("error");
      }
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- db status changes must not retrigger a save
  }, [tasks, availability, saved, courses, weekTemplate, loaded, planId]);

  // ---------- Your own data ----------
  const clearWhatIfs = () => {
    setChanges([]);
    setLabels([]);
    setExplain({ status: "idle" });
  };

  const addCourse = (course: string) => setCourses((cs) => uniq([...cs, course]));

  const removeCourse = (course: string) => {
    const count = tasks.filter((t) => t.course === course).length;
    if (count && !confirm(`Remove ${course} and its ${count} assignment${count > 1 ? "s" : ""}?`)) return;
    setCourses((cs) => cs.filter((c) => c !== course));
    setTasks((ts) => ts.filter((t) => t.course !== course));
  };

  const addTask = (task: Task) => {
    setTasks((ts) => [...ts, task]);
    const next = [...tasks, task];
    const days = buildSchedule(next, extendAvailability(availability, weekTemplate, next, availability.length ? undefined : today)).days;
    startRipple(task.dueDate, days);
  };

  const updateTask = (taskId: string, patch: Partial<Task>) => {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    if (patch.dueDate) {
      // A real date change replaces any what-if move for this task.
      setChanges((cs) => cs.filter((c) => !(c.type === "moveDeadline" && c.taskId === taskId)));
      setLabels((ls) => ls.filter((l) => l.key !== `move:${taskId}`));
    }
  };

  const deleteTask = (taskId: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== taskId));
    setChanges((cs) =>
      cs.filter((c) => !(("taskId" in c && c.taskId === taskId) || (c.type === "addTask" && c.task.id === taskId))),
    );
    setLabels((ls) => ls.filter((l) => l.key !== `move:${taskId}`));
  };

  const setWeekdayHours = (weekday: number, hours: number) => {
    setWeekTemplate((w) => w.map((h, i) => (i === weekday ? hours : h)));
    // Your typical week also updates days you'd already set for that weekday.
    setAvailability((av) => av.map((a) => (dayOfWeek(a.date) === weekday ? { ...a, hoursFree: hours } : a)));
  };

  const startFresh = () => {
    if (tasks.length && !confirm("Clear all classes and assignments and start your own plan?")) return;
    setTasks([]);
    setCourses([]);
    setAvailability([]);
    setSaved([]);
    clearWhatIfs();
    setWeek(0);
  };

  const loadDemo = () => {
    if (tasks.length && !confirm("Replace your classes and assignments with the demo week?")) return;
    setTasks(demoTasks);
    setCourses([]);
    setAvailability(demoAvailability);
    setWeekTemplate(DEFAULT_WEEK);
    clearWhatIfs();
    setWeek(0);
  };

  // ---------- Scenario edits ----------
  const startRipple = (date: ISODate | null, days = after.days) => {
    const idx = Math.max(0, date ? days.findIndex((d) => d.date === date) : 0);
    setRipple((r) => ({ origin: idx, key: r.key + 1 }));
    setWeek(Math.floor(idx / 7));
  };

  const addLabel = (label: Label) => setLabels((ls) => [...ls.filter((l) => l.key !== label.key), label]);

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
    clearWhatIfs();
    startRipple(null);
  };

  // Step 14: tasks from the syllabus drop.
  const importTasks = (incoming: Task[], replace: boolean) => {
    const existing = replace ? [] : tasks.filter((t) => !incoming.some((n) => n.id === t.id));
    const nextTasks = [...existing, ...incoming];
    setTasks(nextTasks);
    setCourses((cs) => uniq([...(replace ? [] : cs), ...incoming.map((t) => t.course)]));
    clearWhatIfs();
    const nextDays = buildSchedule(
      nextTasks,
      extendAvailability(availability, weekTemplate, nextTasks, availability.length ? undefined : today),
    ).days;
    const first = incoming.reduce<ISODate | null>((m, t) => (!m || t.dueDate < m ? t.dueDate : m), null);
    startRipple(first, nextDays);
  };

  const saveScenario = () => {
    if (!changes.length) return;
    const scenario: Scenario = {
      name: scenarioName || "My scenario",
      changes,
      explanation: explain.status === "done" ? explain.data.explanation : undefined,
    };
    setSaved((prev) => [...prev.filter((s) => s.name !== scenario.name), scenario]);
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
          body: JSON.stringify({ scenarioName, tasks, availability: baseAvailability, changes }),
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
  }, [changes, scenarioName, tasks, baseAvailability]);

  const days = after.days;
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
            <SyllabusDrop startDate={days[0]?.date ?? demoAvailability[0].date} onImport={importTasks} />
            {changes.length > 0 && (
              <button onClick={reset} className="ml-auto rounded-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Reset
              </button>
            )}
          </section>

          <ClassesPanel
            courses={allCourses}
            week={weekTemplate}
            startDate={days[0]?.date ?? baseAvailability[0]?.date}
            defaultOpen={tasks.length === 0}
            onAddCourse={addCourse}
            onRemoveCourse={removeCourse}
            onAddTask={addTask}
            onWeekChange={setWeekdayHours}
            onStartFresh={startFresh}
            onLoadDemo={loadDemo}
          />

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
            onMoveDeadline={moveDeadline}
          />
          <TaskList
            tasks={plan.tasks}
            courses={allCourses}
            before={before}
            after={after}
            onMoveDeadline={moveDeadline}
            onUpdateTask={updateTask}
            onDeleteTask={deleteTask}
          />
          <Universes plan={plan} />
          <DbStatus state={db} />
        </div>

        <OptionsPanel state={explain} hasChanges={changes.length > 0} />
      </div>
    </div>
  );
}

function DbStatus({ state }: { state: DbState }) {
  const text: Record<DbState, string> = {
    checking: "Connecting to database…",
    none: "Not saving: no database connected (add MONGODB_URI to .env.local).",
    ready: "Connected to MongoDB. Changes save automatically.",
    saving: "Saving…",
    saved: "All changes saved to MongoDB.",
    error: "Couldn't reach the database. Your changes aren't being saved.",
  };
  return <p className={`text-xs ${state === "error" ? "text-red-600" : "text-slate-500"}`}>{text[state]}</p>;
}
