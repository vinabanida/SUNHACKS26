"use client";

import { useMemo, useState } from "react";
import { parallelUniverses, type PlanInput } from "@/lib/scheduler";
import type { UniversesResponse } from "@/lib/explain";
import { LEVEL_STYLE } from "./Heatmap";

export default function Universes({ plan }: { plan: PlanInput }) {
  const universes = useMemo(() => parallelUniverses(plan), [plan]);
  const planKey = useMemo(() => JSON.stringify(plan), [plan]);
  const [pick, setPick] = useState<{ key: string; data: UniversesResponse } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Gemini's pick only applies to the plan it was asked about.
  const verdict = pick?.key === planKey ? pick.data : null;

  async function askGemini() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/universes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      if (!res.ok) throw new Error(`Server said ${res.status}`);
      setPick({ key: planKey, data: await res.json() });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Parallel universes</h2>
        <button
          onClick={askGemini}
          disabled={loading}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Which one should I pick?"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {universes.map((u, i) => {
          const best = verdict?.bestIndex === i;
          const atRisk = u.result.summary.atRisk;
          const lowEnergy = Math.min(...u.result.days.map((d) => d.energy));
          return (
            <div
              key={u.name}
              className={`relative rounded-xl border bg-white p-4 shadow-sm transition ${
                best ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200"
              } ${verdict && !best ? "opacity-60" : ""}`}
            >
              {best && (
                <span className="pop-in absolute -top-3 right-3 rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                  Gemini&apos;s pick
                </span>
              )}
              <div className="font-semibold">{u.name}</div>
              <div className="text-xs text-slate-500">{u.description}</div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-4xl font-bold tabular-nums">{u.score}</span>
                <span className="mb-1 text-xs text-slate-500">survival</span>
              </div>
              <div className="mt-2 flex gap-0.5" aria-label="Daily load">
                {u.result.days.slice(0, 14).map((d) => (
                  <span
                    key={d.date}
                    className="h-3 flex-1 rounded-sm border border-black/10"
                    style={{ background: LEVEL_STYLE[d.level].bg }}
                    title={`${d.date}: ${LEVEL_STYLE[d.level].label}`}
                  />
                ))}
              </div>
              <ul className="mt-3 space-y-0.5 text-xs text-slate-600">
                <li className={atRisk ? "font-medium text-red-700" : ""}>
                  {atRisk === 0 ? "Nothing at risk" : `${atRisk} task${atRisk > 1 ? "s" : ""} at risk`}
                </li>
                <li className={u.sleepDebtHours > 0 ? "font-medium text-amber-700" : ""}>
                  {u.sleepDebtHours > 0
                    ? `${u.sleepDebtHours}h of lost sleep`
                    : i === 2
                      ? "No all-nighters needed"
                      : "No lost sleep"}
                </li>
                <li>Energy bottoms out at {lowEnergy}%</li>
              </ul>
            </div>
          );
        })}
      </div>

      {verdict && (
        <div className="pop-in mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <div className="font-semibold text-indigo-900">{verdict.headline}</div>
          <p className="mt-1 text-indigo-900/80">{verdict.explanation}</p>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}
