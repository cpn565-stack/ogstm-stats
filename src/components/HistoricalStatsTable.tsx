import type { HistoricalOptionRow } from "@/lib/history";

interface HistoricalStatsTableProps {
  rows: HistoricalOptionRow[];
}

export function HistoricalStatsTable({ rows }: HistoricalStatsTableProps) {
  if (rows.length === 0) {
    return null;
  }

  const questions = [...new Set(rows.map((row) => row.questionId))];

  return (
    <div className="space-y-8">
      {questions.map((questionId) => {
        const questionRows = rows.filter((row) => row.questionId === questionId);
        const label = questionRows[0]?.questionLabel ?? questionId;

        return (
          <section key={questionId} className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-100">{label}</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-700/80">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-900/80 text-left text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">選項</th>
                    <th className="px-4 py-3 font-medium text-emerald-400">
                      歷史贊成
                    </th>
                    <th className="px-4 py-3 font-medium text-rose-400">
                      歷史反對
                    </th>
                    <th className="px-4 py-3 font-medium">總計</th>
                    <th className="px-4 py-3 font-medium">贊成率</th>
                    <th className="px-4 py-3 font-medium">出現場次</th>
                  </tr>
                </thead>
                <tbody>
                  {questionRows.map((row) => (
                    <tr
                      key={`${row.questionId}-${row.option}`}
                      className="border-t border-slate-800/80"
                    >
                      <td className="px-4 py-3 font-mono font-semibold">
                        {row.option}
                      </td>
                      <td className="px-4 py-3 text-emerald-300">
                        {row.totalGreen}
                      </td>
                      <td className="px-4 py-3 text-rose-300">{row.totalRed}</td>
                      <td className="px-4 py-3">{row.totalVotes}</td>
                      <td className="px-4 py-3">{row.greenRate}%</td>
                      <td className="px-4 py-3 text-slate-400">
                        {row.sessionCount} 場
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}