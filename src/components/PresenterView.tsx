"use client";

import { buildQuestionPresentation } from "@/lib/presenter";
import type { PresentedOption } from "@/lib/presenter";
import { apiPath } from "@/lib/paths";
import type { SessionStats, ThinkingMapTemplate } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

interface PresenterViewProps {
  sessionId: string;
  initialStats: SessionStats;
  refreshIntervalMs?: number;
}

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
      className={`rounded-xl border px-4 py-3 ${
        isGreen
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-rose-500/30 bg-rose-500/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`text-sm font-medium ${isGreen ? "text-emerald-400" : "text-rose-400"}`}
        >
          第 {option.rank} 名
          {option.tied && <span className="ml-1 opacity-80">· 並列</span>}
        </p>
        <p
          className={`shrink-0 font-mono text-lg font-bold ${isGreen ? "text-emerald-300" : "text-rose-300"}`}
        >
          {value} 票
        </p>
      </div>
      <p className="mt-2 text-base leading-relaxed text-slate-100">
        <span className="mr-2 font-mono font-bold text-slate-300">
          {option.option}.
        </span>
        {description ?? `選項 ${option.option}`}
      </p>
    </li>
  );
}

function RankingSection({
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
      <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-center text-sm text-slate-500">
        尚無資料
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h3
        className={`text-sm font-semibold ${tone === "green" ? "text-emerald-400" : "text-rose-400"}`}
      >
        {title}
      </h3>
      <ul className="space-y-2">
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

export function PresenterView({
  sessionId,
  initialStats,
  refreshIntervalMs = 5000,
}: PresenterViewProps) {
  const [stats, setStats] = useState(initialStats);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    const response = await fetch(apiPath(`/api/sessions/${sessionId}`));
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

  const template = stats.template as ThinkingMapTemplate;
  const presentations = stats.questions.map((question) => {
    const presentation = buildQuestionPresentation(question);
    const templateQuestion = template.questions.find(
      (item) => item.id === question.questionId,
    );
    return {
      ...presentation,
      optionLabels: templateQuestion?.optionLabels,
    };
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-4 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-emerald-400">講師視圖</p>
            <h1 className="truncate text-lg font-bold">{stats.session.name}</h1>
            <p className="mt-1 text-xs text-slate-500">
              已完成 {stats.completedGroups} 組 · 每{" "}
              {refreshIntervalMs / 1000} 秒更新 ·{" "}
              {lastUpdated.toLocaleTimeString("zh-TW")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="shrink-0 cursor-pointer rounded-lg border border-slate-600 px-3 py-2 text-sm transition hover:bg-slate-800"
          >
            更新
          </button>
        </div>
      </header>

      <main className="space-y-6 px-4 py-5 pb-10">
        {stats.completedGroups === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 px-4 py-12 text-center">
            <p className="font-medium text-slate-300">等待各組資料輸入</p>
            <p className="mt-1 text-sm text-slate-500">
              助教完成輸入後，結果會顯示在此供您口述
            </p>
          </div>
        ) : (
          presentations.map((presentation) => (
            <section
              key={presentation.questionId}
              className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/40 p-4"
            >
              <h2 className="text-base font-bold leading-snug">
                {presentation.label}
              </h2>

              <RankingSection
                title="綠 · 贊成前 5（同票並列）"
                tone="green"
                options={presentation.top5Green}
                valueKey="green"
                optionLabels={presentation.optionLabels}
              />

              <RankingSection
                title="紅 · 反對前 5（同票並列）"
                tone="red"
                options={presentation.top5Red}
                valueKey="red"
                optionLabels={presentation.optionLabels}
              />
            </section>
          ))
        )}
      </main>
    </div>
  );
}