"use client";

import { buildQuestionPresentation } from "@/lib/presenter";
import type { SessionStats } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

interface PresenterViewProps {
  sessionId: string;
  initialStats: SessionStats;
  refreshIntervalMs?: number;
}

function VerdictBadge({
  verdict,
}: {
  verdict: "approved" | "rejected" | "split" | "none";
}) {
  const styles = {
    approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    rejected: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    split: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    none: "bg-slate-700/40 text-slate-400 border-slate-600/40",
  } as const;

  const labels = {
    approved: "贊成居多",
    rejected: "反對居多",
    split: "意見分散",
    none: "尚無票數",
  } as const;

  return (
    <span
      className={`rounded-full border px-3 py-1 text-sm font-medium ${styles[verdict]}`}
    >
      {labels[verdict]}
    </span>
  );
}

export function PresenterView({
  sessionId,
  initialStats,
  refreshIntervalMs = 5000,
}: PresenterViewProps) {
  const [stats, setStats] = useState(initialStats);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/sessions/${sessionId}`);
    if (!response.ok) return;
    const data = (await response.json()) as SessionStats;
    setStats(data);
    setLastUpdated(new Date());
  }, [sessionId]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [refresh, refreshIntervalMs]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  }

  const presentations = stats.questions.map(buildQuestionPresentation);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 px-6 py-5 sm:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
              講師視圖
            </p>
            <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
              {stats.session.name}
            </h1>
            <p className="mt-2 text-slate-400">
              即時統計各組表決結果 · 每 {refreshIntervalMs / 1000} 秒自動更新
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-5 py-3 text-center">
              <p className="text-xs text-slate-400">已完成組數</p>
              <p className="text-2xl font-bold text-emerald-400">
                {stats.completedGroups}
                <span className="text-base text-slate-500">
                  /{stats.totalGroups}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="cursor-pointer rounded-xl border border-slate-600 px-4 py-3 text-sm transition hover:bg-slate-800"
            >
              立即更新
            </button>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="cursor-pointer rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              {isFullscreen ? "離開全螢幕" : "全螢幕投影"}
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          最後更新：{lastUpdated.toLocaleTimeString("zh-TW")}
        </p>
      </header>

      <main className="space-y-10 px-6 py-8 sm:px-10">
        {stats.completedGroups === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/30 px-8 py-16 text-center">
            <p className="text-2xl font-semibold text-slate-300">等待各組資料輸入</p>
            <p className="mt-2 text-slate-500">
              助教完成輸入後，統計結果會自動顯示在此
            </p>
          </div>
        ) : (
          presentations.map((presentation) => (
            <section
              key={presentation.questionId}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 sm:p-8"
            >
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {presentation.label}
                </h2>
                {presentation.topApproved && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
                    <p className="text-sm text-emerald-300">最多人贊成</p>
                    <p className="text-3xl font-bold text-emerald-400">
                      選項 {presentation.topApproved.option}
                      <span className="ml-3 text-lg font-medium text-emerald-300">
                        {presentation.topApproved.green} 票
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {presentation.approvedOptions.length > 0 && (
                <div className="mb-6">
                  <p className="mb-3 text-sm font-medium text-emerald-400">
                    各組傾向贊成的選項
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presentation.approvedOptions.map((option) => (
                      <span
                        key={option.option}
                        className="rounded-lg bg-emerald-500/15 px-4 py-2 font-mono text-lg font-semibold text-emerald-300"
                      >
                        {option.option}
                        <span className="ml-2 text-sm text-emerald-400/80">
                          {option.green} 贊成
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {presentation.rejectedOptions.length > 0 && (
                <div className="mb-8">
                  <p className="mb-3 text-sm font-medium text-rose-400">
                    各組傾向反對的選項
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presentation.rejectedOptions.map((option) => (
                      <span
                        key={option.option}
                        className="rounded-lg bg-rose-500/15 px-4 py-2 font-mono text-lg font-semibold text-rose-300"
                      >
                        {option.option}
                        <span className="ml-2 text-sm text-rose-400/80">
                          {option.red} 反對
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {presentation.options.map((option) => {
                  const maxVotes = Math.max(
                    ...presentation.options.map((item) =>
                      Math.max(item.green, item.red),
                    ),
                    1,
                  );
                  const greenWidth = (option.green / maxVotes) * 100;
                  const redWidth = (option.red / maxVotes) * 100;

                  return (
                    <div
                      key={option.option}
                      className={`rounded-xl border p-5 transition ${
                        option.rank === 1 && option.verdict === "approved"
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-slate-700/80 bg-slate-950/50"
                      }`}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <span className="font-mono text-4xl font-bold">
                          {option.option}
                        </span>
                        <VerdictBadge verdict={option.verdict} />
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="text-emerald-400">贊成</span>
                            <span className="font-mono font-semibold text-emerald-300">
                              {option.green}
                            </span>
                          </div>
                          <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                              style={{ width: `${greenWidth}%` }}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="text-rose-400">反對</span>
                            <span className="font-mono font-semibold text-rose-300">
                              {option.red}
                            </span>
                          </div>
                          <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-rose-500 transition-all duration-500"
                              style={{ width: `${redWidth}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <p className="mt-4 text-sm text-slate-400">
                        贊成率 {option.greenRate}% · 共 {option.total} 票
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}