import type { HistoricalOptionRow } from "@/lib/history";
import { getTemplate } from "@/lib/template";

interface HistoricalStatsTableProps {
  rows: HistoricalOptionRow[];
}

export function HistoricalStatsTable({ rows }: HistoricalStatsTableProps) {
  if (rows.length === 0) {
    return null;
  }

  const template = getTemplate();
  const questions = [...new Set(rows.map((row) => row.questionId))];

  return (
    <div className="space-y-8">
      {questions.map((questionId) => {
        const questionRows = rows.filter(
          (row) => row.questionId === questionId,
        );
        const templateQuestion = template.questions.find(
          (q) => q.id === questionId,
        );
        const label = questionRows[0]?.questionLabel ?? questionId;
        const greenLabel = templateQuestion?.greenLabel ?? "最重要";
        const redLabel = templateQuestion?.redLabel ?? "最易忽略";

        return (
          <section key={questionId} className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-100">{label}</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-700/80">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/80 text-left text-slate-400">
                  <tr>
                    <th className="min-w-48 px-4 py-3 font-medium">選項</th>
                    <th className="px-4 py-3 font-medium text-emerald-400">
                      綠 · {greenLabel}
                    </th>
                    <th className="px-4 py-3 font-medium text-rose-400">
                      紅 · {redLabel}
                    </th>
                    <th className="px-4 py-3 font-medium">總計</th>
                    <th className="px-4 py-3 font-medium">綠佔比</th>
                    <th className="px-4 py-3 font-medium">出現場次</th>
                  </tr>
                </thead>
                <tbody>
                  {questionRows.map((row) => {
                    const optionText =
                      row.optionLabel ??
                      templateQuestion?.optionLabels?.[row.option];
                    return (
                      <tr
                        key={`${row.questionId}-${row.option}`}
                        className="border-t border-slate-800/80"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono font-semibold text-slate-200">
                            {row.option}
                          </span>
                          {optionText && (
                            <p className="mt-0.5 max-w-md text-sm leading-snug text-slate-400">
                              {optionText}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-emerald-300">
                          {row.totalGreen}
                        </td>
                        <td className="px-4 py-3 text-rose-300">
                          {row.totalRed}
                        </td>
                        <td className="px-4 py-3">{row.totalVotes}</td>
                        <td className="px-4 py-3">{row.greenRate}%</td>
                        <td className="px-4 py-3 text-slate-400">
                          {row.sessionCount} 場
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
