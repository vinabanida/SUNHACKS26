// Fake ASU-style week for testing and the demo. Week of Mon Nov 16, 2026.
import type { Availability, Task } from "./types";

export const DEMO_START = "2026-11-16"; // Monday

export const demoTasks: Task[] = [
  { id: "mat343-hw9", title: "HW 9: Eigenvalues", course: "MAT 343", dueDate: "2026-11-18", estimatedHours: 3, priority: "medium", done: false },
  { id: "cse340-quiz", title: "Quiz 4 prep", course: "CSE 340", dueDate: "2026-11-19", estimatedHours: 2, priority: "medium", done: false },
  { id: "cse310-proj3", title: "Project 3: Hash tables", course: "CSE 310", dueDate: "2026-11-20", estimatedHours: 10, priority: "high", done: false },
  { id: "hst-reading", title: "Ch. 12 reading", course: "HST 109", dueDate: "2026-11-20", estimatedHours: 2, priority: "low", done: false },
  { id: "phy121-lab", title: "Lab 8 report", course: "PHY 121", dueDate: "2026-11-21", estimatedHours: 3, priority: "medium", done: false },
  { id: "eng102-essay", title: "Essay 3 draft", course: "ENG 102", dueDate: "2026-11-22", estimatedHours: 5, priority: "medium", done: false },
];

export const demoAvailability: Availability[] = [
  { date: "2026-11-16", hoursFree: 4 }, // Mon
  { date: "2026-11-17", hoursFree: 3 }, // Tue
  { date: "2026-11-18", hoursFree: 5 }, // Wed
  { date: "2026-11-19", hoursFree: 3 }, // Thu
  { date: "2026-11-20", hoursFree: 4 }, // Fri
  { date: "2026-11-21", hoursFree: 6 }, // Sat
  { date: "2026-11-22", hoursFree: 6 }, // Sun
];
