import { extractDeadlines } from "@/lib/syllabus";
import { hasGemini } from "@/lib/gemini";
import { todayISO } from "@/lib/scheduler";

const MAX_BYTES = 15 * 1024 * 1024;

// Accepts multipart form data: either `file` (PDF or .txt) or `text`, plus `startDate` (YYYY-MM-DD).
export async function POST(request: Request) {
  if (!hasGemini()) return Response.json({ error: "Gemini is not configured on the server." }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Send the syllabus as form data." }, { status: 400 });
  }

  const startDate = String(form.get("startDate") || todayISO());
  const file = form.get("file");
  const text = String(form.get("text") || "").trim();

  try {
    let source: { text: string } | { pdfBase64: string };
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return Response.json({ error: "That file is over 15 MB." }, { status: 413 });
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      source = isPdf
        ? { pdfBase64: Buffer.from(await file.arrayBuffer()).toString("base64") }
        : { text: await file.text() };
    } else if (text) {
      source = { text };
    } else {
      return Response.json({ error: "Drop a PDF or paste some syllabus text." }, { status: 400 });
    }

    const result = await extractDeadlines(source, todayISO(), startDate);
    return Response.json(result);
  } catch (err) {
    console.error("Syllabus extraction failed:", err);
    return Response.json({ error: "Gemini couldn't read that syllabus. Try pasting the text instead." }, { status: 502 });
  }
}
