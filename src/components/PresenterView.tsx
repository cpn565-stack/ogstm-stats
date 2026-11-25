"use client";

import { RankingSection } from "@/components/RankingSection";
import { readJsonResponse } from "@/lib/fetch-json";
import { apiPath } from "@/lib/paths";
import { buildQuestionPresentation } from "@/lib/presenter";
import type { SessionStats, ThinkingMapTemplate } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

interface PresenterViewProps {
  sessionId: string;
  initialStats: SessionStats;
  refreshIntervalMs?: number;
}

export function PresenterView({
  sessionId,
  initialStats,
  refreshIntervalMs = 5000,
}: PresenterViewProps) {
  const [stats, setStats] = useState(initialStats);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [offline, setOffline] = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState(
    initialStats.questions[0]?.questionId ?? "",
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(apiPath(`/api/sessions/${sessionId}`), {
        cache: "no-store",
      });
      if (!response.ok) {
        setOffline(true);
        return;
      }
      const data = await readJsonResponse<SessionStats>(response);
      setStats(data);
      setLastUpdated(new Date());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [sessionId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    }, refreshIntervalMs);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh, refreshIntervalMs]);

  const template = stats.template as ThinkingMapTemplate;
  const presentations = stats.questions.map((question) => {
    const presentation = buildQuestionPresentation(question);
    const templateQuestion = template.questions.find(
      (item) => item.id === question.questionId,
    );
    return {
      ...presentation,
      shortLabel: templateQuestion?.shortLabel,
      greenLabel:
        templateQuestion?.greenLabel ?? question.greenLabel ?? "最重要",
      redLabel: templateQuestion?.redLabel ?? question.redLabel ?? "最易忽略",
      optionLabels: templateQuestion?.optionLabels,
    };
  });

  const activePresentation =
    presentations.find((p) => p.questionId === activeQuestionId) ??
    presentations[0];

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-emerald-400">
              講師口述
            </p>
            <h1 className="truncate text-xl font-bold">{stats.session.name}</h1>
            <p className="mt-1 text-xs text-slate-500">
              {stats.completedGroups} 組 · {refreshIntervalMs / 1000}s 更新 ·{" "}
              {lastUpdated.toLocaleTimeString("zh-TW", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {offline && (
              <p className="mt-1 text-xs text-amber-300" role="status">
                網路連線不穩，重試中…（目前顯示最後更新資料）
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-600 text-sm font-medium transition duration-200 hover:bg-slate-800 active:bg-slate-700"
            aria-label="立即更新"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="size-5"
              aria-hidden
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>

        {presentations.length > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
            {presentations.map((presentation) => {
              const isActive = presentation.questionId === activeQuestionId;
              return (
                <button
                  key={presentation.questionId}
                  type="button"
                  onClick={() => setActiveQuestionId(presentation.questionId)}
                  className={`min-h-12 cursor-pointer rounded-xl px-3 py-2 text-left text-sm font-semibold transition duration-200 active:scale-[0.99] ${
                    isActive
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-800 text-slate-300 active:bg-slate-700"
                  }`}
                >
                  <span className="font-mono text-base">
                    {presentation.shortLabel ?? presentation.questionId}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-xs font-normal ${isActive ? "text-slate-800" : "text-slate-500"}`}
                  >
                    {presentation.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="space-y-5 px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {stats.completedGroups === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 px-4 py-16 text-center">
            <p className="text-lg font-medium text-slate-300">等待各組輸入</p>
            <p className="mt-2 text-sm text-slate-500">
              助教完成手動輸入後，排行會顯示在此
            </p>
          </div>
        ) : (
          <>
            <section className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-4 md:hidden">
              {activePresentation && (
                <>
                  <h2 className="text-lg font-bold leading-snug">
                    {activePresentation.label}
                  </h2>
                  <RankingSection
                    title={`綠 · ${activePresentation.greenLabel}（前 5，同票並列）`}
                    tone="green"
                    options={activePresentation.top5Green}
                    valueKey="green"
                    optionLabels={activePresentation.optionLabels}
                  />
                  <RankingSection
                    title={`紅 · ${activePresentation.redLabel}（前 5，同票並列）`}
                    tone="red"
                    options={activePresentation.top5Red}
                    valueKey="red"
                    optionLabels={activePresentation.optionLabels}
                  />
                </>
              )}
            </section>

            <div className="hidden space-y-6 md:block">
              {presentations.map((presentation) => (
                <section
                  key={presentation.questionId}
                  className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                >
                  <h2 className="text-lg font-bold leading-snug">
                    {presentation.label}
                  </h2>
                  <RankingSection
                    title={`綠 · ${presentation.greenLabel}（前 5，同票並列）`}
                    tone="green"
                    options={presentation.top5Green}
                    valueKey="green"
                    optionLabels={presentation.optionLabels}
                  />
                  <RankingSection
                    title={`紅 · ${presentation.redLabel}（前 5，同票並列）`}
                    tone="red"
                    options={presentation.top5Red}
                    valueKey="red"
                    optionLabels={presentation.optionLabels}
                  />
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
