"use client";

interface VoteCounterProps {
  label: string;
  description?: string;
  green: number;
  red: number;
  onChange: (green: number, red: number) => void;
  mode?: "stepper" | "checkbox";
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
        className="min-h-11 min-w-11 cursor-pointer px-3 py-2 text-lg transition hover:bg-white/5 active:bg-white/10"
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
        className="min-h-11 min-w-11 cursor-pointer px-3 py-2 text-lg transition hover:bg-white/5 active:bg-white/10"
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}

function MarkToggle({
  checked,
  onToggle,
  color,
  title,
  subtitle,
}: {
  checked: boolean;
  onToggle: () => void;
  color: "green" | "red";
  title: string;
  subtitle: string;
}) {
  const isGreen = color === "green";
  const activeClass = isGreen
    ? "border-emerald-400 bg-emerald-500/20 text-emerald-100 ring-2 ring-emerald-500/40"
    : "border-rose-400 bg-rose-500/20 text-rose-100 ring-2 ring-rose-500/40";
  const idleClass =
    "border-slate-600 bg-slate-800/80 text-slate-300 active:bg-slate-700";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`flex min-h-[3.25rem] flex-1 cursor-pointer flex-col items-center justify-center rounded-xl border px-2 py-3 transition duration-200 ${checked ? activeClass : idleClass}`}
    >
      <span className="text-base font-bold leading-none">{title}</span>
      <span className="mt-1 text-xs leading-tight opacity-90">{subtitle}</span>
    </button>
  );
}

export function VoteCounter({
  label,
  description,
  green,
  red,
  onChange,
  mode = "stepper",
}: VoteCounterProps) {
  if (mode === "checkbox") {
    return (
      <article className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4">
        <div className="mb-3 flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 font-mono text-lg font-bold text-emerald-400">
            {label}
          </span>
          {description ? (
            <p className="min-w-0 flex-1 text-base leading-snug text-slate-200">
              {description}
            </p>
          ) : (
            <p className="text-base text-slate-400">選項 {label}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MarkToggle
            checked={green > 0}
            onToggle={() => onChange(green > 0 ? 0 : 1, red)}
            color="green"
            title="綠"
            subtitle="最重要"
          />
          <MarkToggle
            checked={red > 0}
            onToggle={() => onChange(green, red > 0 ? 0 : 1)}
            color="red"
            title="紅"
            subtitle="最易忽略"
          />
        </div>
      </article>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-lg font-semibold text-slate-200">
          {label}
        </span>
        {description && (
          <p className="mt-0.5 text-sm text-slate-400">{description}</p>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <span className="text-sm text-emerald-400">綠 · 最重要</span>
          <Stepper
            value={green}
            color="green"
            onChange={(next) => onChange(next, red)}
          />
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <span className="text-sm text-rose-400">紅 · 最易忽略</span>
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