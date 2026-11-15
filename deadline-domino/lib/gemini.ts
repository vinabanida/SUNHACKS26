// Server-only Gemini helper: one place for the API key, model fallback and timeouts.
import { GoogleGenAI, ThinkingLevel, type ContentListUnion } from "@google/genai";

// Tried in order: if one is overloaded (503) or slow, fall through to the next.
export const GEMINI_MODELS = [
  ...(process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []),
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.1-flash-lite",
];

export function hasGemini() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Ask Gemini for JSON matching `schema`. Tries each model until one answers.
 * Throws if none do, so callers can use their own plain-code fallback.
 */
export async function generateJSON<T>(
  contents: ContentListUnion,
  schema: object,
  { timeoutMs = 12_000, temperature = 0.4 }: { timeoutMs?: number; temperature?: number } = {},
): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });

  let lastError: unknown;
  for (const model of GEMINI_MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: schema,
          temperature,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });
      return JSON.parse(res.text ?? "") as T;
    } catch (err) {
      lastError = err;
      console.error(`Gemini (${model}) failed:`, err instanceof Error ? err.message.slice(0, 200) : err);
    }
  }
  throw lastError ?? new Error("All Gemini models failed");
}
