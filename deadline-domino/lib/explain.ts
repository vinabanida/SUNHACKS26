// Server-only: builds Gemini prompts from the scheduler's numbers and parses the answers.
// Our code does the scheduling; Gemini only explains it in plain language.
import { generateJSON, hasGemini } from "./gemini";
import {
  applyScenario,
  buildSchedule,
  diffSchedules,
  parallelUniverses,
  RISK_LABEL,
  weekdayName,
  type PlanInput,
} from "./scheduler";
import type { ScenarioChange, ScheduleResult, Task } from "./types";

export interface ExplainOption {
  id: "grade" | "sleep" | "extension";
  title: string;
  plan: string;
  tradeoff: string;
}

export interface ExplainResponse {
  explanation: string;
  options: ExplainOption[];
  source: "gemini" | "fallback";
}

const explainSchema = {
  type: "object",
  properties: {
    explanation: {
      type: "string",
      description: "2-3 sentences. What this change costs, naming specific courses, days and hours.",
    },
    options: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          id: { type: "string", enum: ["grade", "sleep", "extension"] },
          title: { type: "string", description: "e.g. 'Protect your grade'" },
          plan: { type: "string", description: "1-2 sentences: concrete moves (which hours move from which day to which task)." },
          tradeoff: { type: "string", description: "1 sentence: what you give up." },
        },
        required: ["id", "title", "plan", "tradeoff"],
      },
    },
  },
  required: ["explanation", "options"],
};

export function describeSchedule(result: ScheduleResult, tasks: Task[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return {
    tasks: result.tasks.map((r) => {
      const t = byId.get(r.taskId)!;
      return {
        task: `${t.course}: ${t.title}`,
        due: `${weekdayName(t.dueDate)} ${t.dueDate}`,
        priority: t.priority,
        hoursNeeded: r.hoursNeeded,
        hoursScheduled: r.hoursScheduled,
        hoursShort: r.hoursShort,
        spareHours: r.spareHoursBeforeDue,
        status: RISK_LABEL[r.risk],
      };
    }),
    days: result.days.map((d) => ({
      day: `${weekdayName(d.date)} ${d.date}`,
      hoursFree: d.hoursFree,
      hoursScheduled: d.hoursScheduled,
      overflowHours: d.overflowHours,
      load: d.level,
      work: d.blocks.map((b) => `${byId.get(b.taskId)?.course ?? b.taskId} ${b.hours}h`).join(", "),
    })),
    survivalScore: result.summary.survivalScore,
  };
}

const RULES = `Rules:
- Use ONLY the numbers given. Be specific (course codes, weekdays, hours). No markdown, no emojis. Keep it short.
- Work on a task can only happen on or before its due day. Never suggest moving work to a day after its deadline.
- A day can't hold more hours than its hoursFree unless the option is explicitly about staying up later.`;

export async function explainScenario(
  input: PlanInput,
  scenarioName: string,
  changes: ScenarioChange[],
): Promise<ExplainResponse> {
  const before = buildSchedule(input.tasks, input.availability);
  const next = applyScenario(input, changes);
  const after = buildSchedule(next.tasks, next.availability);
  const diff = diffSchedules(before, after, next.tasks);

  if (!hasGemini()) return fallback(scenarioName, diff);

  const prompt = `You are a calm, practical study coach for a college student.
A scheduling algorithm (earliest deadline first) already planned their week. Something just changed: "${scenarioName}".

Explain the impact in plain, friendly language, then give exactly 3 options:
- id "grade": protect the grade (prioritize the most important/at-risk work, even if it costs rest)
- id "sleep": protect sleep/health (keep days reasonable, accept a lower score on low-priority work)
- id "extension": ask for an extension on the single most impossible task (name the course and how many days would help)

${RULES}

WHAT CHANGED:
${JSON.stringify(diff)}

PLAN AFTER THE CHANGE:
${JSON.stringify(describeSchedule(after, next.tasks))}`;

  try {
    const parsed = await generateJSON<Omit<ExplainResponse, "source">>(prompt, explainSchema);
    if (!parsed.explanation || parsed.options?.length !== 3) throw new Error("bad shape");
    return { ...parsed, source: "gemini" };
  } catch {
    return fallback(scenarioName, diff);
  }
}

/** Plain-code backup so the demo still works if Gemini or Wi-Fi fails. */
function fallback(scenarioName: string, diff: ReturnType<typeof diffSchedules>): ExplainResponse {
  const worse = diff.tasks.filter((t) => t.riskAfter !== t.riskBefore);
  const atRisk = diff.tasks.filter((t) => t.riskAfter === "at-risk");
  const explanation = worse.length
    ? `${scenarioName} changes things: ${worse
        .map((t) => `${t.course} ${t.title} goes from ${t.riskBefore ?? "new"} to ${t.riskAfter}`)
        .join("; ")}. Survival score ${diff.survivalBefore} → ${diff.survivalAfter}.`
    : `${scenarioName} shifts some hours around, but every deadline still fits. Survival score ${diff.survivalBefore} → ${diff.survivalAfter}.`;
  const hardest = atRisk[0] ?? worse[0];
  return {
    source: "fallback",
    explanation,
    options: [
      { id: "grade", title: "Protect your grade", plan: "Move hours from low-priority reading to your highest-priority deadline this week.", tradeoff: "Less free time and later nights." },
      { id: "sleep", title: "Protect your sleep", plan: "Keep every day at or under your normal hours and let low-priority work slip.", tradeoff: "Some low-priority tasks get less time." },
      { id: "extension", title: "Ask for an extension", plan: hardest ? `Ask your ${hardest.course} professor for 2 extra days on ${hardest.title}.` : "Ask for 2 extra days on your biggest deadline.", tradeoff: "Depends on the professor saying yes." },
    ],
  };
}

// ---------- Step 15: parallel universes ----------

export interface UniversesResponse {
  bestIndex: number;
  headline: string;
  explanation: string;
  source: "gemini" | "fallback";
}

const universesSchema = {
  type: "object",
  properties: {
    bestIndex: { type: "integer", description: "0, 1 or 2: index of the universe you recommend" },
    headline: { type: "string", description: "Max 8 words, e.g. 'Stay on pace, it's the only safe path'" },
    explanation: { type: "string", description: "2-3 sentences comparing the three, with specific numbers." },
  },
  required: ["bestIndex", "headline", "explanation"],
};

export async function explainUniverses(input: PlanInput): Promise<UniversesResponse> {
  const universes = parallelUniverses(input);
  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const summary = universes.map((u, i) => ({
    index: i,
    name: u.name,
    description: u.description,
    survivalScore: u.score,
    atRiskTasks: u.result.tasks
      .filter((t) => t.risk === "at-risk")
      .map((t) => `${byId.get(t.taskId)?.course} ${byId.get(t.taskId)?.title} (${t.hoursShort}h short)`),
    tightTasks: u.result.summary.tight,
    sleepDebtHours: u.sleepDebtHours,
    lowestEnergy: Math.min(...u.result.days.map((d) => d.energy)),
  }));

  const fallbackPick = (): UniversesResponse => {
    const best = summary.reduce((a, b) => (b.survivalScore > a.survivalScore ? b : a));
    return {
      source: "fallback",
      bestIndex: best.index,
      headline: `${best.name} survives best`,
      explanation: `${best.name} has the highest survival score (${best.survivalScore}) with ${best.atRiskTasks.length} task(s) at risk and ${best.sleepDebtHours}h of lost sleep.`,
    };
  };
  if (!hasGemini()) return fallbackPick();

  const prompt = `You are a practical study coach. A scheduler simulated 3 parallel universes for a student's week.
Pick the one you'd recommend and explain why in plain, friendly language. Weigh missed deadlines most, then sleep debt and energy.
Use ONLY these numbers. No markdown, no emojis. Refer to universes by name (e.g. "All-nighter mode"), never by index or number.
Talk to the student as "you". Energy is 0-100%.

${JSON.stringify(summary)}`;

  try {
    const parsed = await generateJSON<Omit<UniversesResponse, "source">>(prompt, universesSchema);
    if (![0, 1, 2].includes(parsed.bestIndex) || !parsed.explanation) throw new Error("bad shape");
    return { ...parsed, source: "gemini" };
  } catch {
    return fallbackPick();
  }
}
