import { explainScenario } from "@/lib/explain";
import type { Availability, ScenarioChange, Task } from "@/lib/types";

interface ExplainRequest {
  scenarioName: string;
  tasks: Task[];
  availability: Availability[];
  changes: ScenarioChange[];
}

export async function POST(request: Request) {
  let body: ExplainRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.tasks) || !Array.isArray(body.availability) || !Array.isArray(body.changes)) {
    return Response.json({ error: "tasks, availability and changes are required" }, { status: 400 });
  }

  const result = await explainScenario(
    { tasks: body.tasks, availability: body.availability },
    String(body.scenarioName || "Your change"),
    body.changes,
  );
  return Response.json(result);
}
