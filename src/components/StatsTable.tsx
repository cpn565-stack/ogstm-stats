import type { AggregatedQuestion, Submission } from "@/lib/types";

interface StatsTableProps {
  questions: AggregatedQuestion[];
  submissions: Submission[];
}

export function StatsTable({ questions, submissions }: StatsTableProps) {
  return (
    <div className="space-y-8">
      {questions.map((question) => (
        <section key={question.questionId} className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-100">
            {question.label}
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-700/80">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">選項</th>
                  <th className="px-4 py-3 font-medium text-emerald-400">
                    贊成 (綠)
                  </th>
                  <th className="px-4 py-3 font-medium text-rose-400">
                    反對 (紅)
                  </th>
                  <th className="px-4 py-3 font-medium">總計</th>
                  <th className="px-4 py-3 font-medium">贊成率</th>
                </tr>
              </thead>
              <tbody>
                {question.options.map((option) => (
                  <tr
                    key={option.option}
                    className="border-t border-slate-800/80"
                  >
                    <td className="px-4 py-3 font-mono font-semibold">
                      {option.option}
                    </td>
                    <td className="px-4 py-3 text-emerald-300">{option.green}</td>
                    <td className="px-4 py-3 text-rose-300">{option.red}</td>
                    <td className="px-4 py-3">{option.total}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${option.greenRate}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-slate-400">
                          {option.greenRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-100">各組紀錄</h3>
        {submissions.length === 0 ? (
          <p className="text-sm text-slate-400">尚無資料，請開始輸入各組票數。</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="rounded-xl border border-slate-700/80 bg-slate-900/50 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">第 {submission.groupId} 組</span>
                  <span className="text-xs text-slate-400">
                    {submission.source === "photo" ? "拍照" : "手動"}
                  </span>
                </div>
                {submission.confidence !== undefined && (
                  <p className="mt-1 text-xs text-slate-500">
                    辨識信心：{Math.round(submission.confidence * 100)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}