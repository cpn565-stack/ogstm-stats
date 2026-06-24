import type { PublicSummary } from "@/lib/history";
import Link from "next/link";

const mainSiteUrl =
  process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://ogstm.com";

export function PublicStatsHome({ summary }: { summary: PublicSummary }) {
  return (
    <main className="space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
          OGSTM Stats
        </p>
        <h1 className="text-3xl font-bold text-slate-50 sm:text-4xl">
          組織表決趨勢
        </h1>
        <p className="max-w-2xl text-slate-400">
          跨場次累計的常見贊成與反對選項（僅顯示加總，不含各組明細）。
        </p>
        <a
          href={mainSiteUrl}
          className="inline-block text-sm text-emerald-400 transition hover:text-emerald-300"
        >
          ← 返回 ogstm.com
        </a>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">累計場次</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">
            {summary.totalSessions}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">累計組別紀錄</p>
          <p className="mt-1 text-3xl font-bold">{summary.totalSubmissions}</p>
        </div>
      </div>

      {summary.highlights.length > 0 && (
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <h2 className="text-lg font-semibold text-emerald-300">組織常見狀況</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-300">
            {summary.highlights.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </section>
      )}

      {summary.questions.map((question) => (
        <section
          key={question.questionId}
          className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
        >
          <h2 className="text-xl font-bold">{question.label}</h2>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-emerald-400">
              歷史贊成前 5（同票並列）
            </h3>
            {question.top5Green.length === 0 ? (
              <p className="text-sm text-slate-500">尚無資料</p>
            ) : (
              <ul className="space-y-2">
                {question.top5Green.map((item) => (
                  <li
                    key={`g-${item.option}`}
                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-emerald-400">
                        第 {item.rank} 名{item.tied ? " · 並列" : ""}
                      </p>
                      <p className="font-mono font-semibold text-emerald-300">
                        {item.green} 票
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-200">
                      <span className="font-mono font-bold text-slate-400">
                        {item.option}.
                      </span>{" "}
                      {item.label}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-rose-400">
              歷史反對前 5（同票並列）
            </h3>
            {question.top5Red.length === 0 ? (
              <p className="text-sm text-slate-500">尚無資料</p>
            ) : (
              <ul className="space-y-2">
                {question.top5Red.map((item) => (
                  <li
                    key={`r-${item.option}`}
                    className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-rose-400">
                        第 {item.rank} 名{item.tied ? " · 並列" : ""}
                      </p>
                      <p className="font-mono font-semibold text-rose-300">
                        {item.red} 票
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-slate-200">
                      <span className="font-mono font-bold text-slate-400">
                        {item.option}.
                      </span>{" "}
                      {item.label}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}

      <footer className="border-t border-slate-800 pt-6 text-sm text-slate-500">
        課程輸入請由團隊使用{" "}
        <Link href="/ops" className="text-emerald-400 hover:text-emerald-300">
          營運入口
        </Link>
        。
      </footer>
    </main>
  );
}