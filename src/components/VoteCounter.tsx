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

function MarkCheckbox({
  checked,
  onChange,
  color,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  color: "green" | "red";
  label: string;
  hint: string;
}) {
  const isGreen = color === "green";
  const activeClass = isGreen
    ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300"
    : "border-rose-500/60 bg-rose-500/10 text-rose-300";
  const idleClass = "border-slate-700 text-slate-400 hover:border-slate-600";

  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${
        checked ? activeClass : idleClass
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 shrink-0 accent-current"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs opacity-80">{hint}</span>
      </span>
    </label>
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
      <div className="flex flex-col gap-3 rounded-xl border border-slate-700/80 bg-slate-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <span className="font-mono text-lg font-semibold text-slate-200">
            {label}
          </span>
          {description && (
            <p className="mt-0.5 text-sm text-slate-400">{description}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <MarkCheckbox
            checked={green > 0}
            onChange={(checked) => onChange(checked ? 1 : 0, red)}
            color="green"
            label="綠"
            hint="最重要"
          />
          <MarkCheckbox
            checked={red > 0}
            onChange={(checked) => onChange(green, checked ? 1 : 0)}
            color="red"
            label="紅"
            hint="最容易被忽略"
          />
        </div>
      </div>
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
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-emerald-400">綠 · 最重要</span>
          <Stepper
            value={green}
            color="green"
            onChange={(next) => onChange(next, red)}
          />
        </div>
        <div className="flex items-center gap-2">
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