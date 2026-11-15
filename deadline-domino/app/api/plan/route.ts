import { hasDb, plans } from "@/lib/db";
import type { Availability, Scenario, Task } from "@/lib/types";

const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

// GET /api/plan?id=...  → saved tasks, availability and scenarios (404 if none yet)
export async function GET(request: Request) {
  if (!hasDb()) return Response.json({ error: "no-db" }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  try {
    const doc = await (await plans()).findOne({ _id: id });
    if (!doc) return Response.json({ error: "not-found" }, { status: 404 });
    return Response.json({ tasks: doc.tasks, availability: doc.availability, scenarios: doc.scenarios ?? [] });
  } catch (err) {
    console.error("Load plan failed:", err);
    return Response.json({ error: "Database unreachable" }, { status: 502 });
  }
}

// PUT /api/plan  { id, tasks, availability, scenarios }  → upsert
export async function PUT(request: Request) {
  if (!hasDb()) return Response.json({ error: "no-db" }, { status: 503 });
  let body: { id: string; tasks: Task[]; availability: Availability[]; scenarios?: Scenario[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!ID_RE.test(body.id ?? "") || !Array.isArray(body.tasks) || !Array.isArray(body.availability)) {
    return Response.json({ error: "id, tasks and availability are required" }, { status: 400 });
  }

  // Don't store computed schedules, only the inputs (they're cheap to recompute).
  const scenarios = (body.scenarios ?? []).slice(0, 50).map(({ name, changes, explanation }) => ({ name, changes, explanation }));
  try {
    await (await plans()).updateOne(
      { _id: body.id },
      { $set: { tasks: body.tasks, availability: body.availability, scenarios, updatedAt: new Date() } },
      { upsert: true },
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Save plan failed:", err);
    return Response.json({ error: "Database unreachable" }, { status: 502 });
  }
}
