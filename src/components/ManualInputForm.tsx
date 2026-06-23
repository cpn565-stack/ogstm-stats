"use client";

import { VoteCounter } from "@/components/VoteCounter";
import type { SubmissionVotes, ThinkingMapTemplate } from "@/lib/types";
import { useState } from "react";

interface ManualInputFormProps {
  sessionId: string;
  template: ThinkingMapTemplate;
  initialGroupId?: string;
  initialVotes?: SubmissionVotes;
  onSaved?: (groupId: string) => void;
}

export function ManualInputForm({
  sessionId,
  template,
  initialGroupId = "",
  initialVotes,
  onSaved,
}: ManualInputFormProps) {
  const [groupId, setGroupId] = useState(initialGroupId);
  const [votes, setVotes] = useState<SubmissionVotes>(
    initialVotes ??
      Object.fromEntries(
        template.questions.map((question) => [
          question.id,
          Object.fromEntries(
            question.options.map((option) => [option, { green: 0, red: 0 }]),
          ),
        ]),
      ),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!groupId.trim()) {
      setMessage("請輸入組別");
      return;
    }

    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/sessions/${sessionId}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: groupId.trim(),
        votes,
        source: "manual",
      }),
    });

    setSaving(false);

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setMessage(data.error ?? "儲存失敗");
      return;
    }

    setMessage("已儲存");
    onSaved?.(groupId.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <label className="block space-y-2">
        <span className="text-sm text-slate-400">組別</span>
        <input
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          placeholder="例如：3"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none ring-emerald-500/40 focus:ring-2"
        />
      </label>

      {template.questions.map((question) => (
        <section key={question.id} className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">
            {question.label}
          </h2>
          <div className="space-y-2">
            {question.options.map((option) => {
              const counts = votes[question.id][option];
              return (
                <VoteCounter
                  key={option}
                  label={option}
                  green={counts.green}
                  red={counts.red}
                  onChange={(green, red) =>
                    setVotes((current) => ({
                      ...current,
                      [question.id]: {
                        ...current[question.id],
                        [option]: { green, red },
                      },
                    }))
                  }
                />
              );
            })}
          </div>
        </section>
      ))}

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