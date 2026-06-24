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

    setMessage(`已儲存（${activeQuestion.shortLabel ?? questionId}）`);
    setVotes((current) => ({
      ...current,
      [questionId]: emptyVotesForQuestion(template, questionId),
    }));
    onSaved?.(groupId.trim());
  }

  if (!activeQuestion) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <QuestionPhasePicker
        questions={template.questions}
        selectedId={questionId}
        onChange={handleQuestionChange}
      />

      <label className="block space-y-2">
        <span className="text-sm text-slate-400">組別</span>
        <input
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          placeholder="例如：3"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none ring-emerald-500/40 focus:ring-2"
        />
      </label>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">
          {activeQuestion.label}
        </h2>
        <div className="space-y-2">
          {activeQuestion.options.map((option) => {
            const counts = votes[questionId][option];
            return (
              <VoteCounter
                key={option}
                label={option}
                description={activeQuestion.optionLabels?.[option]}
                green={counts.green}
                red={counts.red}
                onChange={(green, red) =>
                  setVotes((current) => ({
                    ...current,
                    [questionId]: {
                      ...current[questionId],
                      [option]: { green, red },
                    },
                  }))
                }
              />
            );
          })}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="cursor-pointer rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "儲存中…" : "儲存並下一組"}
        </button>
        {message && <p className="text-sm text-slate-400">{message}</p>}
      </div>
    </form>
  );
}