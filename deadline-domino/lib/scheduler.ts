// Deadline Domino scheduler: plain functions, no React/Next/DB, so it's instant and testable.
//
// Algorithm:
//   1. Sort open tasks: earliest deadline first, then priority (high > medium > low).
//   2. For each task, hand out its hours in small chunks across the days before its
//      deadline, always picking the least-loaded day (ties → earlier day). This spreads
//      work out instead of cramming, so the heatmap shows real pressure.
//   3. Hours that don't fit pile up on the due date as "overflow" → task is at risk.
//   4. Label each task Safe / Tight / At risk from how much slack is left.

import type {
  Availability,
  DaySchedule,
  ISODate,
  Priority,
  Risk,
  Scenario,
  ScenarioChange,
  ScheduleResult,
  StressLevel,
  Task,
  TaskResult,
} from "./types";

// ---------- Tunables ----------

export const CHUNK_HOURS = 0.5; // smallest unit of work we hand out
export const TIGHT_SPARE_RATIO = 0.25; // < 25% of the task's hours spare → Tight
export const TIGHT_SPARE_MIN_HOURS = 1; // ...or less than 1 spare hour
export const HEALTHY_HOURS_PER_DAY = 8; // above this, survival score drops (sleep!)
export const DEFAULT_HOURS_FREE = 3; // free hours assumed for days you haven't set

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
const EPS = 1e-6;

// ---------- Date helpers (UTC math on YYYY-MM-DD strings, so no timezone bugs) ----------

export function addDays(date: ISODate, n: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function weekdayName(date: ISODate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** Today in the user's local timezone as YYYY-MM-DD. */
export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const minDate = (dates: ISODate[]) => dates.reduce((a, b) => (b < a ? b : a));
const maxDate = (dates: ISODate[]) => dates.reduce((a, b) => (b > a ? b : a));

// ---------- Typical week ----------

/** Free hours per weekday, indexed like Date.getUTCDay(): 0 = Sunday ... 6 = Saturday. */
export type WeekTemplate = number[];
export const DEFAULT_WEEK: WeekTemplate = [5, 4, 4, 4, 4, 3, 5];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayOfWeek(date: ISODate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Fill every day from the plan start through the last deadline (at least 2 weeks) using
 * the typical week. Days already in `availability` (explicit overrides) are kept as-is.
 */
export function extendAvailability(
  availability: Availability[],
  week: WeekTemplate,
  tasks: Task[],
  start: ISODate = availability.length ? minDate(availability.map((a) => a.date)) : todayISO(),
): Availability[] {
  const lastDue = tasks.length ? maxDate(tasks.map((t) => t.dueDate)) : start;
  const end = maxDate([addDays(start, 13), lastDue, ...availability.map((a) => a.date)]);
  const have = new Map(availability.map((a) => [a.date, a.hoursFree]));
  const out: Availability[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push({ date: d, hoursFree: have.get(d) ?? week[dayOfWeek(d)] ?? DEFAULT_HOURS_FREE });
  }
  return out;
}

// ---------- Scheduler ----------

export interface ScheduleOptions {
  /** First day you can work. Default: earliest availability date. */
  startDate?: ISODate;
  /** Hours for days missing from the availability list. Default DEFAULT_HOURS_FREE. */
  defaultHoursFree?: number;
  /** Can you still work on the due date itself? Default true (due 11:59pm). */
  workOnDueDate?: boolean;
  /** Late-night hours per day you're willing to add, used only for work that won't fit. Default 0. */
  overtimePerDay?: number;
}

/** Earliest deadline first, then priority, then bigger tasks first. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.estimatedHours - a.estimatedHours ||
      a.id.localeCompare(b.id),
  );
}

export function buildSchedule(
  tasks: Task[],
  availability: Availability[],
  opts: ScheduleOptions = {},
): ScheduleResult {
  const { defaultHoursFree = DEFAULT_HOURS_FREE, workOnDueDate = true, overtimePerDay = 0 } = opts;
  const open = tasks.filter((t) => !t.done && t.estimatedHours > 0);

  const freeByDate = new Map<ISODate, number>();
  for (const a of availability) freeByDate.set(a.date, a.hoursFree);

  const startDate =
    opts.startDate ??
    (availability.length ? minDate(availability.map((a) => a.date)) : null) ??
    (open.length ? minDate(open.map((t) => t.dueDate)) : todayISO());
  const endDate = maxDate([
    startDate,
    ...open.map((t) => t.dueDate),
    ...availability.map((a) => a.date),
  ]);

  // Build the day grid.
  type WorkDay = DaySchedule & { remaining: number };
  const days: WorkDay[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    const hoursFree = Math.max(0, freeByDate.get(d) ?? defaultHoursFree);
    days.push({
      date: d,
      hoursFree,
      remaining: hoursFree,
      hoursScheduled: 0,
      overflowHours: 0,
      overtimeHours: 0,
      blocks: [],
      stress: 0,
      level: "free",
      energy: 100,
    });
  }

  const lastWorkDay = (t: Task) => (workOnDueDate ? t.dueDate : addDays(t.dueDate, -1));

  // Allocate. Pass 1: normal free hours, spread evenly (least-loaded day first).
  const ordered = sortTasks(open);
  const hoursByTask = new Map<string, Map<WorkDay, number>>();
  const needLeft = new Map<string, number>();
  const give = (taskId: string, day: WorkDay, hours: number) => {
    const m = hoursByTask.get(taskId)!;
    m.set(day, (m.get(day) ?? 0) + hours);
  };

  for (const task of ordered) {
    const last = lastWorkDay(task);
    const window = days.filter((d) => d.date <= last);
    hoursByTask.set(task.id, new Map());
    let need = task.estimatedHours;

    while (need > EPS) {
      // Least-loaded day in the window (by % used); ties go to the earlier day.
      let best: WorkDay | null = null;
      let bestUsed = Infinity;
      for (const day of window) {
        if (day.remaining <= EPS) continue;
        const used = 1 - day.remaining / day.hoursFree;
        if (used < bestUsed - EPS) {
          best = day;
          bestUsed = used;
        }
      }
      if (!best) break; // no room left before the deadline

      const take = Math.min(CHUNK_HOURS, need, best.remaining);
      best.remaining -= take;
      need -= take;
      give(task.id, best, take);
    }
    needLeft.set(task.id, need);
  }

  // Pass 2 (only with overtimePerDay): late nights, used ONLY for work that didn't fit,
  // crammed into the nights closest to the deadline, like a real all-nighter.
  if (overtimePerDay > 0) {
    const nightsLeft = new Map(days.map((d) => [d, overtimePerDay]));
    for (const task of ordered) {
      let need = needLeft.get(task.id)!;
      const window = days.filter((d) => d.date <= lastWorkDay(task)).reverse();
      for (const day of window) {
        if (need <= EPS) break;
        const take = Math.min(need, nightsLeft.get(day)!);
        if (take <= EPS) continue;
        nightsLeft.set(day, nightsLeft.get(day)! - take);
        day.overtimeHours = r2(day.overtimeHours + take);
        need -= take;
        give(task.id, day, take);
      }
      needLeft.set(task.id, need);
    }
  }

  const partial: Omit<TaskResult, "spareHoursBeforeDue" | "risk">[] = [];
  for (const task of ordered) {
    const need = needLeft.get(task.id)!;
    let finishDate: ISODate | null = null;
    for (const [day, hours] of hoursByTask.get(task.id)!) {
      day.blocks.push({ taskId: task.id, hours: r2(hours) });
      day.hoursScheduled = r2(day.hoursScheduled + hours);
      if (!finishDate || day.date > finishDate) finishDate = day.date;
    }

    const hoursShort = r2(Math.max(0, need));
    if (hoursShort > 0) {
      // Pile what didn't fit onto the due date (or day 1 if it's already overdue).
      const pileOn = days.find((d) => d.date === task.dueDate) ?? days[0];
      pileOn.overflowHours = r2(pileOn.overflowHours + hoursShort);
    }

    partial.push({
      taskId: task.id,
      hoursNeeded: task.estimatedHours,
      hoursScheduled: r2(task.estimatedHours - Math.max(0, need)),
      hoursShort,
      finishDate,
    });
  }

  // Risk labels. Slack = free hours up to the deadline minus all work that MUST be done
  // by then. (Not "leftover hours", since flexible later tasks may sit in early days.)
  const taskById = new Map(open.map((t) => [t.id, t]));
  const results: TaskResult[] = partial.map((p) => {
    const task = taskById.get(p.taskId)!;
    const last = lastWorkDay(task);
    const capacity = days.filter((d) => d.date <= last).reduce((s, d) => s + d.hoursFree, 0);
    const mustBeDone = open.filter((t) => lastWorkDay(t) <= last).reduce((s, t) => s + t.estimatedHours, 0);
    const spare = r2(Math.max(0, capacity - mustBeDone));
    return { ...p, spareHoursBeforeDue: spare, risk: riskFor(p.hoursShort, spare, task.estimatedHours) };
  });

  // Day stress + energy. Heavy days drain more the longer the streak runs.
  let energy = 100;
  let heavyStreak = 0;
  for (const day of days) {
    day.stress = stressFor(day.hoursScheduled + day.overflowHours, day.hoursFree);
    day.level = stressLevel(day.stress);
    const isHeavy = day.level === "heavy" || day.level === "overloaded";
    const delta = ENERGY_DELTA[day.level] - (isHeavy ? Math.min(MAX_STREAK_DRAIN, heavyStreak * STREAK_DRAIN) : 0);
    heavyStreak = isHeavy ? heavyStreak + 1 : 0;
    energy = Math.max(0, Math.min(100, energy + delta));
    day.energy = energy;
  }

  const cleanDays: DaySchedule[] = days.map((d) => ({
    date: d.date,
    hoursFree: d.hoursFree,
    hoursScheduled: d.hoursScheduled,
    overflowHours: d.overflowHours,
    overtimeHours: d.overtimeHours,
    blocks: d.blocks,
    stress: d.stress,
    level: d.level,
    energy: d.energy,
  }));
  return {
    startDate,
    days: cleanDays,
    tasks: results,
    summary: summarize(results, open, cleanDays),
  };
}

// ---------- Labels & scores ----------

export function riskFor(hoursShort: number, spareHours: number, taskHours: number): Risk {
  if (hoursShort > EPS) return "at-risk";
  if (spareHours < Math.max(TIGHT_SPARE_MIN_HOURS, taskHours * TIGHT_SPARE_RATIO)) return "tight";
  return "safe";
}

export const RISK_LABEL: Record<Risk, string> = {
  safe: "Safe",
  tight: "Tight",
  "at-risk": "At risk",
};

function stressFor(load: number, hoursFree: number): number {
  if (load <= EPS) return 0;
  if (hoursFree <= EPS) return 1 + load; // work due on a day with no free time = overloaded
  return r2(load / hoursFree);
}

export function stressLevel(stress: number): StressLevel {
  if (stress <= EPS) return "free";
  if (stress < 0.5) return "calm";
  if (stress < 0.85) return "busy";
  if (stress <= 1 + EPS) return "heavy";
  return "overloaded";
}

const ENERGY_DELTA: Record<StressLevel, number> = {
  free: 12,
  calm: 6,
  busy: -1,
  heavy: -4,
  overloaded: -15,
};
const STREAK_DRAIN = 1; // extra drain per consecutive heavy day before this one...
const MAX_STREAK_DRAIN = 3; // ...capped, so long busy stretches don't hit 0 instantly

function summarize(results: TaskResult[], open: Task[], days: DaySchedule[]) {
  const prio = new Map(open.map((t) => [t.id, t.priority]));
  let wNeeded = 0;
  let wScheduled = 0;
  for (const r of results) {
    const w = PRIORITY_WEIGHT[prio.get(r.taskId)!];
    wNeeded += w * r.hoursNeeded;
    wScheduled += w * r.hoursScheduled;
  }
  const tight = results.filter((r) => r.risk === "tight").length;
  const overworkHours = days.reduce((s, d) => s + Math.max(0, d.hoursScheduled - HEALTHY_HOURS_PER_DAY), 0);
  const atRisk = results.filter((r) => r.risk === "at-risk").length;
  const raw = (wNeeded ? (100 * wScheduled) / wNeeded : 100) - 10 * atRisk - 3 * tight - 2 * overworkHours;

  return {
    totalNeeded: r2(results.reduce((s, r) => s + r.hoursNeeded, 0)),
    totalScheduled: r2(results.reduce((s, r) => s + r.hoursScheduled, 0)),
    totalShort: r2(results.reduce((s, r) => s + r.hoursShort, 0)),
    safe: results.filter((r) => r.risk === "safe").length,
    tight,
    atRisk,
    survivalScore: Math.round(Math.max(0, Math.min(100, raw))),
  };
}

// ---------- Scenarios ----------

export interface PlanInput {
  tasks: Task[];
  availability: Availability[];
}

/** Apply "what if" changes without mutating the originals. */
export function applyScenario(input: PlanInput, changes: ScenarioChange[]): PlanInput {
  let tasks = input.tasks.map((t) => ({ ...t }));
  let availability = input.availability.map((a) => ({ ...a }));

  const hoursOn = (date: ISODate) => availability.find((a) => a.date === date)?.hoursFree ?? DEFAULT_HOURS_FREE;
  const setHours = (date: ISODate, hours: number) => {
    const entry = availability.find((a) => a.date === date);
    if (entry) entry.hoursFree = Math.max(0, hours);
    else availability.push({ date, hoursFree: Math.max(0, hours) });
  };

  for (const c of changes) {
    switch (c.type) {
      case "setHours":
        setHours(c.date, c.hours);
        break;
      case "loseHours":
        setHours(c.date, hoursOn(c.date) - c.hours);
        break;
      case "addTask":
        tasks.push({ ...c.task });
        break;
      case "removeTask":
        tasks = tasks.filter((t) => t.id !== c.taskId);
        break;
      case "moveDeadline":
        tasks = tasks.map((t) => (t.id === c.taskId ? { ...t, dueDate: c.newDueDate } : t));
        break;
      case "startLate": {
        if (!availability.length) break;
        const cutoff = addDays(minDate(availability.map((a) => a.date)), c.days);
        availability = availability.map((a) => (a.date < cutoff ? { ...a, hoursFree: 0 } : a));
        break;
      }
      case "extraHoursPerDay":
        availability = availability.map((a) => ({ ...a, hoursFree: a.hoursFree + c.hours }));
        break;
    }
  }
  return { tasks, availability };
}

export function runScenario(input: PlanInput, scenario: Scenario, opts?: ScheduleOptions): Scenario {
  const next = applyScenario(input, scenario.changes);
  return { ...scenario, result: buildSchedule(next.tasks, next.availability, opts) };
}

/** Quick scenario buttons. */
export const presets = {
  sickDay: (date: ISODate): Scenario => ({
    name: `Sick ${weekdayName(date)}`,
    changes: [{ type: "setHours", date, hours: 0 }],
  }),
  surpriseQuiz: (date: ISODate, course: string, prepHours = 3): Scenario => ({
    name: `Surprise quiz ${weekdayName(date)}`,
    changes: [
      {
        type: "addTask",
        task: {
          id: `quiz-${course}-${date}`.replace(/\s+/g, ""),
          title: `${course} pop quiz`,
          course,
          dueDate: date,
          estimatedHours: prepHours,
          priority: "high",
          done: false,
        },
      },
    ],
  }),
  workShift: (date: ISODate, hours = 4): Scenario => ({
    name: `Work picked up a shift ${weekdayName(date)}`,
    changes: [{ type: "loseHours", date, hours }],
  }),
};

export interface Universe {
  name: string;
  description: string;
  changes: ScenarioChange[];
  result: ScheduleResult;
  /** Hours worked beyond your normal free time (all-nighters cost sleep). */
  sleepDebtHours: number;
  /** survivalScore minus a sleep-debt penalty. Highest = best. */
  score: number;
}

export const SLEEP_DEBT_PENALTY = 1.5; // points per hour of lost sleep

/** Step 15: the three side-by-side universes. Highest score = best (Gemini explains why). */
export function parallelUniverses(input: PlanInput, opts?: ScheduleOptions): Universe[] {
  const defs: { name: string; description: string; changes: ScenarioChange[]; overtimePerDay: number }[] = [
    { name: "Current pace", description: "Start now, normal hours", changes: [], overtimePerDay: 0 },
    { name: "Start 2 days late", description: "Procrastinate the first 2 days", changes: [{ type: "startLate", days: 2 }], overtimePerDay: 0 },
    {
      name: "Start late + all-nighters",
      description: "Procrastinate 2 days, then stay up to 4h late to catch up",
      changes: [{ type: "startLate", days: 2 }],
      overtimePerDay: 4,
    },
  ];
  return defs.map(({ overtimePerDay, ...def }) => {
    const next = applyScenario(input, def.changes);
    const result = buildSchedule(next.tasks, next.availability, { ...opts, overtimePerDay });
    // Every late-night hour is an hour of sleep you didn't get.
    const sleepDebtHours = r2(result.days.reduce((s, d) => s + d.overtimeHours, 0));
    const score = Math.max(0, Math.round(result.summary.survivalScore - SLEEP_DEBT_PENALTY * sleepDebtHours));
    return { ...def, result, sleepDebtHours, score };
  });
}

// ---------- Diff (what we send to Gemini) ----------

export interface ScheduleDiff {
  tasks: {
    taskId: string;
    title: string;
    course: string;
    dueDate: ISODate;
    riskBefore: Risk | null;
    riskAfter: Risk | null;
    hoursScheduledBefore: number;
    hoursScheduledAfter: number;
  }[];
  days: { date: ISODate; weekday: string; hoursFreeBefore: number; hoursFreeAfter: number; stressBefore: number; stressAfter: number }[];
  survivalBefore: number;
  survivalAfter: number;
}

/** Compact before/after summary — only what changed — so the Gemini prompt stays small. */
export function diffSchedules(
  before: ScheduleResult,
  after: ScheduleResult,
  tasks: Task[],
): ScheduleDiff {
  const info = new Map(tasks.map((t) => [t.id, t]));
  const b = new Map(before.tasks.map((t) => [t.taskId, t]));
  const a = new Map(after.tasks.map((t) => [t.taskId, t]));
  const ids = [...new Set([...b.keys(), ...a.keys()])];

  const taskChanges = ids
    .map((id) => ({
      taskId: id,
      title: info.get(id)?.title ?? id,
      course: info.get(id)?.course ?? "",
      dueDate: info.get(id)?.dueDate ?? "",
      riskBefore: b.get(id)?.risk ?? null,
      riskAfter: a.get(id)?.risk ?? null,
      hoursScheduledBefore: b.get(id)?.hoursScheduled ?? 0,
      hoursScheduledAfter: a.get(id)?.hoursScheduled ?? 0,
    }))
    .filter((t) => t.riskBefore !== t.riskAfter || t.hoursScheduledBefore !== t.hoursScheduledAfter);

  const bDays = new Map(before.days.map((d) => [d.date, d]));
  const dayChanges = after.days
    .map((d) => {
      const prev = bDays.get(d.date);
      return {
        date: d.date,
        weekday: weekdayName(d.date),
        hoursFreeBefore: prev?.hoursFree ?? 0,
        hoursFreeAfter: d.hoursFree,
        stressBefore: prev?.stress ?? 0,
        stressAfter: d.stress,
      };
    })
    .filter((d) => d.hoursFreeBefore !== d.hoursFreeAfter || d.stressBefore !== d.stressAfter);

  return {
    tasks: taskChanges,
    days: dayChanges,
    survivalBefore: before.summary.survivalScore,
    survivalAfter: after.summary.survivalScore,
  };
}
