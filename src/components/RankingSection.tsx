import type { PresentedOption } from "@/lib/presenter";

function RankingRow({
  option,
  description,
  tone,
  value,
}: {
  option: PresentedOption;
  description?: string;
  tone: "green" | "red";
  value: number;
}) {
  const isGreen = tone === "green";

  return (
    <li
      className={`rounded-2xl border px-4 py-4 ${
        isGreen
          ? "border-emerald-500/35 bg-emerald-500/8"
          : "border-rose-500/35 bg-rose-500/8"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-base font-semibold ${isGreen ? "text-emerald-400" : "text-rose-400"}`}
        >
          第 {option.rank} 名
          {option.tied && <span className="ml-1 font-normal opacity-80">並列</span>}
        </p>
        <p
          className={`shrink-0 rounded-lg px-2.5 py-1 font-mono text-lg font-bold ${isGreen ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}
        >
          {value} 組
        </p>
      </div>
      <p className="mt-3 text-lg leading-relaxed text-slate-50 sm:text-xl">
        <span className="mr-2 inline-flex size-8 items-center justify-center rounded-lg bg-slate-800 font-mono text-base font-bold text-slate-300">
          {option.option}
        </span>
        {description ?? `選項 ${option.option}`}
      </p>
    </li>
  );
}

export function RankingSection({
  title,
  tone,
  options,
  valueKey,
  optionLabels,
}: {
  title: string;
  tone: "green" | "red";
  options: PresentedOption[];
  valueKey: "green" | "red";
  optionLabels?: Record<string, string>;
}) {
  if (options.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">
        尚無勾選
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h3
        className={`text-base font-bold ${tone === "green" ? "text-emerald-400" : "text-rose-400"}`}
      >
        {title}
      </h3>
      <ul className="space-y-3">
        {options.map((option) => (
          <RankingRow
            key={option.option}
            option={option}
            description={optionLabels?.[option.option]}
            tone={tone}
            value={option[valueKey]}
          />
        ))}
      </ul>
    </div>
  );
}
