"use client";

import { QuestionPhasePicker } from "@/components/QuestionPhasePicker";
import { VoteCounter } from "@/components/VoteCounter";
import { apiPath } from "@/lib/paths";
import { emptyVotesForQuestion } from "@/lib/template";
import type { SubmissionVotes, ThinkingMapTemplate } from "@/lib/types";
import { useState } from "react";

interface ManualInputFormProps {
  sessionId: string;
  template: ThinkingMapTemplate;
  initialGroupId?: string;
  onSaved?: (groupId: string) => void;
}

export function ManualInputForm({
  sessionId,
  template,
  initialGroupId = "",
  onSaved,
}: ManualInputFormProps) {
  const [questionId, setQuestionId] = useState(template.questions[0]?.id ?? "");
  const [groupId, setGroupId] = useState(initialGroupId);
  const [votes, setVotes] = useState<SubmissionVotes>(() => {
    const initial: SubmissionVotes = {};
    for (const question of template.questions) {
      initial[question.id] = emptyVotesForQuestion(template, question.id);
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const activeQuestion = template.questions.find(
    (question) => question.id === questionId,
  );

  const markedCount = activeQuestion
    ? activeQuestion.options.filter((option) => {
        const counts = votes[questionId][option];
        return counts.green > 0 || counts.red > 0;
      }).length
    : 0;

  function handleQuestionChange(nextQuestionId: string) {
    setQuestionId(nextQuestionId);
    setVotes((current) => ({
      ...current,
      [nextQuestionId]:
        current[nextQuestionId] ??
        emptyVotesForQuestion(template, nextQuestionId),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!groupId.trim()) {
      setMessage("請輸入組別");
      return;
    }
    if (!activeQuestion) {
      setMessage("請選擇題目");
      return;
    }

    setSaving(true);
    setMessage("");

    const response = await fetch(
      apiPath(`/api/sessions/${sessionId}/submissions`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: groupId.trim(),
          votes: {
            [questionId]: votes[questionId],
          },
          source: "manual",
        }),
      },
    );

    setSaving(false);

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setMessage(data.error ?? "儲存失敗");
      return;
    }

    setMessage(`已儲存 ${activeQuestion.shortLabel ?? questionId} · 第 ${groupId.trim()} 組`);
    setVotes((current) => ({
      ...current,
      [questionId]: emptyVotesForQuestion(template, questionId),
    }));
    onSaved?.(groupId.trim());
  }

  if (!activeQuestion) return null;

  return (
    <>
      <form
        id="manual-input-form"
        onSubmit={handleSubmit}
        className="space-y-5 pb-32"
      >
        <QuestionPhasePicker
          questions={template.questions}
          selectedId={questionId}
          onChange={handleQuestionChange}
        />

        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-400">組別</span>
          <input
            value={groupId}
            onChange={(event) => setGroupId(event.target.value)}
            placeholder="輸入組別數字"
            inputMode="numeric"
            autoComplete="off"
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-2xl font-semibold outline-none ring-emerald-500/40 focus:ring-2"
          />
        </label>

        <section className="space-y-3">
          <div className="sticky top-0 z-[5] -mx-1 rounded-xl border border-slate-800/80 bg-slate-950/90 px-3 py-3 backdrop-blur">
            <h2 className="text-lg font-semibold leading-snug text-slate-100">
              {activeQuestion.label}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300">
                綠＝最重要
              </span>
              <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-300">
                紅＝最易忽略
              </span>
              <span className="rounded-full bg-slate-800 px-2.5 py-1 text-slate-400">
                已勾 {markedCount} 項
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {activeQuestion.options.map((option) => {
              const counts = votes[questionId][option];
              return (
                <VoteCounter
                  key={option}
                  mode="checkbox"
                  label={option}
                  description={activeQuestion.optionLabels?.[option]}
                  green={counts.green > 0 ? 1 : 0}
                  red={counts.red > 0 ? 1 : 0}
                  onChange={(green, red) =>
                    setVotes((current) => ({
                      ...current,
                      [questionId]: {
                        ...current[questionId],
                        [option]: {
                          green: green > 0 ? 1 : 0,
                          red: red > 0 ? 1 : 0,
                        },
                      },
                    }))
                  }
                />
              );
            })}
          </div>
        </section>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-5xl space-y-2">
          {message && (
            <p
              className={`text-center text-sm ${message.includes("失敗") || message.includes("請輸入") ? "text-rose-400" : "text-emerald-400"}`}
              role="status"
            >
              {message}
            </p>
          )}
          <button
            type="submit"
            form="manual-input-form"
            disabled={saving}
            className="w-full min-h-[3.25rem] cursor-pointer rounded-2xl bg-emerald-500 text-lg font-bold text-slate-950 transition duration-200 hover:bg-emerald-400 active:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "儲存中…" : "儲存並下一組"}
          </button>
        </div>
      </div>
    </>
  );
}