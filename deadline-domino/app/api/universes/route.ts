import { explainUniverses } from "@/lib/explain";
import type { Availability, Task } from "@/lib/types";

export async function POST(request: Request) {
  let body: { tasks: Task[]; availability: Availability[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.tasks) || !Array.isArray(body.availability)) {
    return Response.json({ error: "tasks and availability are required" }, { status: 400 });
  }
  return Response.json(await explainUniverses({ tasks: body.tasks, availability: body.availability }));
}
