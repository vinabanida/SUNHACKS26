// Server-only: Gemini reads a syllabus (PDF or pasted text) and pulls out the deadlines.
import { generateJSON } from "./gemini";
import type { ISODate, Priority, Task } from "./types";

interface Extracted {
  course: string;
  items: { title: string; dueDate: string; kind: string; estimatedHours: number; priority: Priority }[];
}

const schema = {
  type: "object",
  properties: {
    course: { type: "string", description: "Course code like 'CSE 310' (or short name if no code)" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short, e.g. 'Project 3: Hash tables', 'Midterm 2'" },
          dueDate: { type: "string", description: "YYYY-MM-DD" },
          kind: { type: "string", enum: ["exam", "project", "homework", "quiz", "paper", "lab", "reading", "other"] },
          estimatedHours: { type: "number", description: "Realistic hours of work/prep needed" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["title", "dueDate", "kind", "estimatedHours", "priority"],
      },
    },
  },
  required: ["course", "items"],
};

export interface SyllabusResult {
  tasks: Task[];
  skippedPast: number;
}

export async function extractDeadlines(
  source: { text: string } | { pdfBase64: string },
  today: ISODate,
  startDate: ISODate,
): Promise<SyllabusResult> {
  const instructions = `Extract every graded deadline from this course syllabus (assignments, projects, quizzes, exams, papers, labs).
Today is ${today}. If a date has no year, pick the year that puts it in the current academic term.
Skip office hours, lectures and holidays. If a weekly item repeats, list each dated occurrence.
Estimate realistic work hours: exam prep 5-8, project 8-15, paper 5-10, homework 2-4, lab report 2-4, quiz prep 1-3, reading 1-2.
Priority: exams/projects/papers worth a lot of the grade = high, homework/labs/quizzes = medium, readings/participation = low.`;

  const contents =
    "text" in source
      ? `${instructions}\n\nSYLLABUS:\n${source.text.slice(0, 60_000)}`
      : [{ inlineData: { mimeType: "application/pdf", data: source.pdfBase64 } }, { text: instructions }];

  const out = await generateJSON<Extracted>(contents, schema, { timeoutMs: 40_000, temperature: 0.1 });
  const course = (out.course || "Course").trim();

  const valid = (out.items ?? []).filter((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.dueDate) && i.title);
  const upcoming = valid.filter((i) => i.dueDate >= startDate);

  const tasks: Task[] = upcoming.map((i, n) => ({
    id: `${course}-${i.title}-${i.dueDate}-${n}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title: i.title.trim(),
    course,
    dueDate: i.dueDate,
    estimatedHours: Math.min(40, Math.max(0.5, Math.round((Number(i.estimatedHours) || 2) * 2) / 2)),
    priority: (["high", "medium", "low"] as const).includes(i.priority) ? i.priority : "medium",
    done: false,
  }));
  return { tasks: tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), skippedPast: valid.length - upcoming.length };
}
