// Run with: npm test   (uses Node's built-in test runner, no extra packages)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyScenario,
  buildSchedule,
  DEFAULT_HOURS_FREE,
  extendAvailability,
  diffSchedules,
  parallelUniverses,
  presets,
  runScenario,
  sortTasks,
} from "./scheduler.ts";
import { demoAvailability, demoTasks } from "./demoData.ts";
import type { Availability, Task } from "./types.ts";

const task = (over: Partial<Task>): Task => ({
  id: "t",
  title: "Task",
  course: "CSE 100",
  dueDate: "2026-11-20",
  estimatedHours: 1,
  priority: "medium",
  done: false,
  ...over,
});
const days = (start: number, hours: number[]): Availability[] =>
  hours.map((h, i) => ({ date: `2026-11-${String(start + i).padStart(2, "0")}`, hoursFree: h }));

test("sorts by earliest deadline, then priority", () => {
  const sorted = sortTasks([
    task({ id: "late", dueDate: "2026-11-25", priority: "high" }),
    task({ id: "low", dueDate: "2026-11-20", priority: "low" }),
    task({ id: "high", dueDate: "2026-11-20", priority: "high" }),
  ]);
  assert.deepEqual(sorted.map((t) => t.id), ["high", "low", "late"]);
});

test("spreads work evenly instead of cramming", () => {
  const r = buildSchedule([task({ estimatedHours: 4, dueDate: "2026-11-19" })], days(16, [2, 2, 2, 2]));
  assert.deepEqual(r.days.map((d) => d.hoursScheduled), [1, 1, 1, 1]);
});

test("never schedules more than a day's free hours", () => {
  const r = buildSchedule(demoTasks, demoAvailability);
  for (const d of r.days) assert.ok(d.hoursScheduled <= d.hoursFree + 1e-9, `${d.date} overbooked`);
});

test("demo week fits: every task fully scheduled, none at risk", () => {
  const r = buildSchedule(demoTasks, demoAvailability);
  assert.equal(r.summary.totalShort, 0);
  assert.equal(r.summary.atRisk, 0);
  assert.equal(r.summary.totalScheduled, 25);
});

test("work is never scheduled after a task's deadline", () => {
  const r = buildSchedule(demoTasks, demoAvailability);
  const due = new Map(demoTasks.map((t) => [t.id, t.dueDate]));
  for (const d of r.days) for (const b of d.blocks) assert.ok(d.date <= due.get(b.taskId)!, `${b.taskId} on ${d.date}`);
});

test("risk labels: safe / tight / at-risk", () => {
  const safe = buildSchedule([task({ estimatedHours: 1, dueDate: "2026-11-17" })], days(16, [2, 2]));
  assert.equal(safe.tasks[0].risk, "safe");

  const tight = buildSchedule([task({ estimatedHours: 3.5, dueDate: "2026-11-17" })], days(16, [2, 2]));
  assert.equal(tight.tasks[0].risk, "tight");

  const atRisk = buildSchedule([task({ estimatedHours: 5, dueDate: "2026-11-16" })], days(16, [2]));
  assert.equal(atRisk.tasks[0].risk, "at-risk");
  assert.equal(atRisk.tasks[0].hoursShort, 3);
  assert.equal(atRisk.days[0].overflowHours, 3);
  assert.equal(atRisk.days[0].level, "overloaded");
});

test("done tasks are ignored", () => {
  const r = buildSchedule([task({ done: true, estimatedHours: 50 })], days(16, [1]));
  assert.equal(r.tasks.length, 0);
  assert.equal(r.summary.survivalScore, 100);
});

test("Sick Tuesday on the demo week puts something at risk", () => {
  const input = { tasks: demoTasks, availability: demoAvailability };
  const before = buildSchedule(demoTasks, demoAvailability);
  const sick = runScenario(input, presets.sickDay("2026-11-17"));
  assert.equal(sick.name, "Sick Tuesday");
  assert.ok(sick.result!.summary.atRisk >= 1);

  const diff = diffSchedules(before, sick.result!, demoTasks);
  assert.ok(diff.days.some((d) => d.date === "2026-11-17" && d.hoursFreeAfter === 0));
  assert.ok(diff.tasks.some((t) => t.riskAfter === "at-risk"));
});

test("applyScenario does not mutate the original data", () => {
  const avail = days(16, [4]);
  const tasks = [task({ id: "a" })];
  applyScenario({ tasks, availability: avail }, [
    { type: "setHours", date: "2026-11-16", hours: 0 },
    { type: "moveDeadline", taskId: "a", newDueDate: "2026-12-01" },
  ]);
  assert.equal(avail[0].hoursFree, 4);
  assert.equal(tasks[0].dueDate, "2026-11-20");
});

test("parallel universes: starting late scores worse than current pace", () => {
  const [current, late] = parallelUniverses({ tasks: demoTasks, availability: demoAvailability });
  assert.equal(current.name, "Current pace");
  assert.ok(late.score < current.score);
  assert.equal(current.sleepDebtHours, 0);
  assert.equal(late.sleepDebtHours, 0);
});

test("all-nighters only cover what didn't fit, and cost exactly that much sleep", () => {
  const [, late, allNighter] = parallelUniverses({ tasks: demoTasks, availability: demoAvailability });
  assert.ok(late.result.summary.totalShort > 0);
  assert.equal(allNighter.sleepDebtHours, late.result.summary.totalShort);
  assert.equal(allNighter.result.summary.atRisk, 0);
  assert.ok(allNighter.score < allNighter.result.summary.survivalScore);
  assert.ok(allNighter.result.days.some((d) => d.level === "overloaded"));
});

test("overtime is crammed into the nights right before the deadline", () => {
  const r = buildSchedule([task({ estimatedHours: 6, dueDate: "2026-11-18" })], days(16, [1, 1, 1]), { overtimePerDay: 2 });
  assert.deepEqual(r.days.map((d) => d.overtimeHours), [0, 1, 2]);
  assert.equal(r.tasks[0].hoursShort, 0);
});

test("current pace has no sleep debt even past the availability list", () => {
  const tasks = [...demoTasks, task({ id: "later", dueDate: "2026-12-04", estimatedHours: 6 })];
  const [current] = parallelUniverses({ tasks, availability: demoAvailability });
  assert.equal(current.sleepDebtHours, 0);
});

test("days missing from availability get default free hours", () => {
  const r = buildSchedule([task({ dueDate: "2026-11-18", estimatedHours: 2 })], days(16, [0]));
  assert.equal(r.days.length, 3);
  assert.equal(r.days[1].hoursFree, DEFAULT_HOURS_FREE);
  assert.equal(r.tasks[0].risk, "safe");
});

test("energy drains on back-to-back heavy days", () => {
  const r = buildSchedule([task({ estimatedHours: 6, dueDate: "2026-11-18" })], days(16, [2, 2, 2]));
  assert.ok(r.days[2].energy < r.days[0].energy);
});

test("typical week fills days through the last deadline, keeping explicit days", () => {
  const week = [1, 2, 3, 4, 5, 6, 7]; // Sun..Sat
  const out = extendAvailability(
    [{ date: "2026-11-16", hoursFree: 9 }], // Monday override
    week,
    [task({ dueDate: "2026-12-05" })],
  );
  assert.equal(out[0].hoursFree, 9); // kept
  assert.equal(out[1].hoursFree, 3); // Tue from template
  assert.equal(out.at(-1)!.date, "2026-12-05");
  assert.equal(out.at(-1)!.hoursFree, 7); // Sat
});
