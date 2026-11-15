"use client";

import { weekdayName } from "@/lib/scheduler";
import type { DaySchedule } from "@/lib/types";

// Step 16: an avatar that gets visibly more tired as heavy days stack up back-to-back.
const MOODS = [
  { min: 80, text: "Fresh" },
  { min: 60, text: "Doing fine" },
  { min: 40, text: "Getting tired" },
  { min: 20, text: "Running on fumes" },
  { min: 0, text: "Burnout zone" },
];

export default function EnergyMeter({ days }: { days: DaySchedule[] }) {
  if (!days.length) return null;
  const low = days.reduce((a, b) => (b.energy < a.energy ? b : a));
  const mood = MOODS.find((m) => low.energy >= m.min) ?? MOODS[MOODS.length - 1];
  const color = low.energy > 60 ? "#16a34a" : low.energy > 30 ? "#f59e0b" : "#dc2626";

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm"
      title="Your energy drains on heavy days, faster when they come back-to-back, and recovers on light days."
    >
      <TiredFace energy={low.energy} />
      <div className="w-36">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-slate-500">Energy</span>
          <span className="text-sm font-semibold tabular-nums">{low.energy}%</span>
        </div>
        <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${low.energy}%`, background: color }} />
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {mood.text}
          {low.energy < 100 && ` · lowest on ${weekdayName(low.date).slice(0, 3)}`}
        </div>
      </div>
    </div>
  );
}

/** A drawn face: eyelids close, the smile turns into a frown and the head droops as energy drops. */
function TiredFace({ energy }: { energy: number }) {
  const e = Math.max(0, Math.min(100, energy)) / 100; // 1 = fresh, 0 = burnt out
  const eyeOpen = 1.2 + 2.3 * e; // eye height
  const mouthCurve = 20 + (e - 0.45) * 14; // control point y: >20 smile, <20 frown
  const skin = e > 0.6 ? "#fde68a" : e > 0.3 ? "#fcd34d" : "#fdba74";
  const tilt = (1 - e) * 14;
  const transition = "all 700ms ease";

  return (
    <svg
      viewBox="0 0 40 40"
      className="h-11 w-11 shrink-0"
      style={{ transform: `rotate(${tilt}deg) translateY(${(1 - e) * 3}px)`, transition }}
      aria-hidden
    >
      <circle cx="20" cy="20" r="17" fill={skin} stroke="#0f172a" strokeOpacity="0.15" style={{ transition }} />
      {/* eyes */}
      <ellipse cx="14" cy="16" rx="2.2" ry={eyeOpen} fill="#0f172a" style={{ transition }} />
      <ellipse cx="26" cy="16" rx="2.2" ry={eyeOpen} fill="#0f172a" style={{ transition }} />
      {/* eye bags when tired */}
      <path d="M11 20.5 q3 1.6 6 0 M23 20.5 q3 1.6 6 0" stroke="#92400e" strokeWidth="0.9" fill="none" opacity={Math.max(0, 0.6 - e)} />
      {/* mouth */}
      <path
        d={`M13 ${26 - (e - 0.45) * 2} Q20 ${mouthCurve + 6} 27 ${26 - (e - 0.45) * 2}`}
        stroke="#0f172a"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        style={{ transition }}
      />
    </svg>
  );
}
