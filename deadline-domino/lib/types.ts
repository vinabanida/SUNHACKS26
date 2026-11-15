// Shared data shapes for Deadline Domino.
// Everyone (UI, Gemini routes, MongoDB) should import from here so we all agree.

/** A calendar day as "YYYY-MM-DD" (no time, no timezone). Compare with < / > directly. */
export type ISODate = string;

export type Priority = "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  course: string; // e.g. "CSE 310"
  dueDate: ISODate; // due at end of this day
  estimatedHours: number;
  priority: Priority;
  done: boolean;
}

export interface Availability {
  date: ISODate;
  hoursFree: number;
}

/** One "what if" edit. A scenario is a list of these applied in order. */
export type ScenarioChange =
  | { type: "setHours"; date: ISODate; hours: number } // "Sick Tuesday" → hours: 0
  | { type: "loseHours"; date: ISODate; hours: number } // "Work picked up a shift"
  | { type: "addTask"; task: Task } // "Surprise quiz Friday"
  | { type: "removeTask"; taskId: string }
  | { type: "moveDeadline"; taskId: string; newDueDate: ISODate } // drag on calendar / extension
  | { type: "startLate"; days: number } // parallel universe: start 2 days late
  | { type: "extraHoursPerDay"; hours: number }; // parallel universe: all-nighter

export interface Scenario {
  id?: string;
  name: string;
  changes: ScenarioChange[];
  result?: ScheduleResult;
  explanation?: string; // filled in by Gemini
}

// ---------- Scheduler output ----------

export type Risk = "safe" | "tight" | "at-risk";

export type StressLevel = "free" | "calm" | "busy" | "heavy" | "overloaded";

export interface WorkBlock {
  taskId: string;
  hours: number;
}

export interface DaySchedule {
  date: ISODate;
  hoursFree: number;
  hoursScheduled: number;
  /** Work that didn't fit anywhere, piled onto the day it's due. */
  overflowHours: number;
  /** Late-night hours beyond your free time (only in all-nighter mode). */
  overtimeHours: number;
  blocks: WorkBlock[];
  /** (scheduled + overflow) / free. 1 = fully booked, >1 = overloaded. */
  stress: number;
  level: StressLevel;
  /** 0–100, drains on back-to-back heavy days, recovers on light ones (for the energy bar). */
  energy: number;
}

export interface TaskResult {
  taskId: string;
  hoursNeeded: number;
  hoursScheduled: number;
  hoursShort: number;
  /** Last day any work is scheduled, or null if none fit. */
  finishDate: ISODate | null;
  /** Free hours up to the deadline minus all work due by then (0 if over capacity). */
  spareHoursBeforeDue: number;
  risk: Risk;
}

export interface ScheduleSummary {
  totalNeeded: number;
  totalScheduled: number;
  totalShort: number;
  safe: number;
  tight: number;
  atRisk: number;
  /** 0–100, used to compare parallel universes. */
  survivalScore: number;
}

export interface ScheduleResult {
  startDate: ISODate;
  days: DaySchedule[];
  tasks: TaskResult[];
  summary: ScheduleSummary;
}
