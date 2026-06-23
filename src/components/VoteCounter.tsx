"use client";

interface VoteCounterProps {
  label: string;
  green: number;
  red: number;
  onChange: (green: number, red: number) => void;
}

function Stepper({
  value,
  onChange,
  color,
}: {
  value: number;
  onChange: (value: number) => void;
  color: "green" | "red";
}) {
  const colorClass =
    color === "green"
      ? "border-emerald-500/40 text-emerald-300"
      : "border-rose-500/40 text-rose-300";

  return (
    <div className={`flex items-center rounded-lg border ${colorClass}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="cursor-pointer px-3 py-2 text-lg transition hover:bg-white/5"
        aria-label="減少"
      >
        −
      </button>
      <span className="min-w-8 text-center font-mono text-lg font-semibold">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="cursor-pointer px-3 py-2 text-lg transition hover:bg-white/5"
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}

export function VoteCounter({ label, green, red, onChange }: VoteCounterProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-3">
      <span className="w-8 font-mono text-lg font-semibold text-slate-200">
        {label}
      </span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-emerald-400">贊成</span>
          <Stepper
            value={green}
            color="green"
            onChange={(next) => onChange(next, red)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-rose-400">反對</span>
          <Stepper
            value={red}
            color="red"
            onChange={(next) => onChange(green, next)}
          />
        </div>
      </div>
    </div>
  );
}