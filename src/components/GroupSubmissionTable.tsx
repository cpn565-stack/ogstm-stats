import type { SessionStats, Submission } from "@/lib/types";
import { Fragment } from "react";

interface GroupSubmissionTableProps {
  stats: SessionStats;
}

export function GroupSubmissionTable({ stats }: GroupSubmissionTableProps) {
  const { submissions, template } = stats;

  if (submissions.length === 0) {
    return (
      <p className="text-sm text-slate-400">此場次尚無各組資料。</p>
    );
  }

  return (
    <div className="space-y-8">
      {template.questions.map((question) => (
        <section key={question.id} className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-100">
            {question.label} — 各組選項
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-700/80">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">組別</th>
                  {question.options.map((option) => (
                    <th
                      key={option}
                      className="px-4 py-3 font-medium"
                      colSpan={2}
                    >
                      {option}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">來源</th>
                </tr>
                <tr className="border-t border-slate-800/80 text-xs">
                  <th className="px-4 py-2" />
                  {question.options.flatMap((option) => [
                    <th
                      key={`${option}-green`}
                      className="px-2 py-2 font-normal text-emerald-400"
                    >
                      綠
                    </th>,
                    <th
                      key={`${option}-red`}
                      className="px-2 py-2 font-normal text-rose-400"
                    >
                      紅
                    </th>,
                  ])}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission: Submission) => (
                  <tr
                    key={submission.id}
                    className="border-t border-slate-800/80"
                  >
                    <td className="px-4 py-3 font-semibold">
                      第 {submission.groupId} 組
                    </td>
                    {question.options.flatMap((option) => {
                      const counts = submission.votes[question.id]?.[option] ?? {
                        green: 0,
                        red: 0,
                      };
                      return [
                        <td
                          key={`${submission.id}-${option}-green`}
                          className="px-2 py-3 text-center text-emerald-300"
                        >
                          {counts.green}
                        </td>,
                        <td
                          key={`${submission.id}-${option}-red`}
                          className="px-2 py-3 text-center text-rose-300"
                        >
                          {counts.red}
                        </td>,
                      ];
                    })}
                    <td className="px-4 py-3 text-slate-400">
                      {submission.source === "photo" ? "拍照" : "手動"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}