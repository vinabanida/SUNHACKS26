"use client";

import type { ExplainResponse } from "@/lib/explain";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: ExplainResponse }
  | { status: "error"; message: string };

export default function OptionsPanel({ state, hasChanges }: { state: State; hasChanges: boolean }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          What this means
          {state.status === "done" && state.data.source === "fallback" && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">offline mode</span>
          )}
        </h2>
        {!hasChanges || state.status === "idle" ? (
          <p className="text-sm text-slate-600">
            Try a scenario button or drag a day&apos;s hours slider. Gemini will explain what it costs you and give you 3 ways out.
          </p>
        ) : state.status === "loading" ? (
          <div className="space-y-2" aria-busy="true">
            <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        ) : state.status === "error" ? (
          <p className="text-sm text-red-600">Couldn&apos;t reach the explainer. {state.message}</p>
        ) : (
          <p className="text-sm leading-relaxed text-slate-800">{state.data.explanation}</p>
        )}
      </div>

      {state.status === "done" &&
        state.data.options.map((o, i) => (
          <div
            key={o.id}
            className="pop-in rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <h3 className="font-semibold">{o.title}</h3>
            <p className="mt-1 text-sm text-slate-700">{o.plan}</p>
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-semibold">Tradeoff:</span> {o.tradeoff}
            </p>
          </div>
        ))}
    </aside>
  );
}
