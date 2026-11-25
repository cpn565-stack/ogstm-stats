"use client";

import { QuestionPhasePicker } from "@/components/QuestionPhasePicker";
import { VoteCounter } from "@/components/VoteCounter";
import { readJsonResponse } from "@/lib/fetch-json";
import { apiPath } from "@/lib/paths";
import { emptyVotesForQuestion } from "@/lib/template";
import type {
  Submission,
  SubmissionVotes,
  ThinkingMapTemplate,
  VoteCounts,
} from "@/lib/types";
import { useEffect, useRef, useState } from "react";

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
  const [isErrorMessage, setIsErrorMessage] = useState(false);
  const [existingBanner, setExistingBanner] = useState("");
  const dirtyRef = useRef(false);

  const activeQuestion = template.questions.find(
    (question) => question.id === questionId,
  );

  useEffect(() => {
    const trimmed = groupId.trim();
    if (!trimmed || !questionId) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          apiPath(
            `/api/sessions/${sessionId}/submissions/${encodeURIComponent(trimmed)}`,
          ),
          { cache: "no-store", signal: controller.signal },
        );

        if (response.status === 404) {
          setExistingBanner("");
          return;
        }
        if (response.status === 401) {
          setIsErrorMessage(true);
          setMessage("登入已過期，請重新整理並登入營運頁面");
          return;
        }
        if (!response.ok) return;

        const data = await readJsonResponse<{ submission?: Submission }>(
          response,
        );
        const savedVotes = data.submission?.votes?.[questionId];
        if (!savedVotes) {
          setExistingBanner("");
          return;
        }

        if (!dirtyRef.current) {
          const base = emptyVotesForQuestion(template, questionId);
          const merged: VoteCounts = { ...base };
          for (const opt of Object.keys(base)) {
            const counts = savedVotes[opt];
            if (counts) {
              merged[opt] = {
                green: counts.green > 0 ? 1 : 0,
                red: counts.red > 0 ? 1 : 0,
              };
            }
          }
          setVotes((current) => ({ ...current, [questionId]: merged }));
          setExistingBanner(
            `第 ${trimmed} 組已有紀錄，已載入既有勾選；儲存將覆寫更新`,
          );
        } else {
          setExistingBanner(
            `注意：第 ${trimmed} 組已有紀錄，儲存將覆寫該組此題資料`,
          );
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [groupId, questionId, sessionId, template]);

  function handleGroupIdChange(nextValue: string) {
    setGroupId(nextValue);
    setExistingBanner("");
    dirtyRef.current = false;
    setVotes((current) => ({
      ...current,
      [questionId]: emptyVotesForQuestion(template, questionId),
    }));
  }

  function handleQuestionChange(nextQuestionId: string) {
    setQuestionId(nextQuestionId);
    setExistingBanner("");
    dirtyRef.current = false;
    setVotes((current) => ({
      ...current,
      [nextQuestionId]: emptyVotesForQuestion(template, nextQuestionId),
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedGroup = groupId.trim();
    if (!trimmedGroup) {
      setIsErrorMessage(true);
      setMessage("請輸入組別");
      return;
    }
    if (!activeQuestion) {
      setIsErrorMessage(true);
      setMessage("請選擇題目");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        apiPath(`/api/sessions/${sessionId}/submissions`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: trimmedGroup,
            votes: {
              [questionId]: votes[questionId],
            },
            source: "manual",
          }),
        },
      );

      if (response.status === 401) {
        setIsErrorMessage(true);
        setMessage("登入已過期，請重新整理並登入營運頁面");
        return;
      }

      const data = await readJsonResponse<{
        submission?: Submission;
        error?: string;
      }>(response);

      if (!response.ok) {
        setIsErrorMessage(true);
        setMessage(data.error ?? "儲存失敗");
        return;
      }

      setIsErrorMessage(false);
      setMessage(
        `✓ 已儲存 ${activeQuestion.shortLabel ?? questionId} · 第 ${trimmedGroup} 組，請輸入下一組組別`,
      );
      setGroupId("");
      setExistingBanner("");
      dirtyRef.current = false;
      setVotes((current) => ({
        ...current,
        [questionId]: emptyVotesForQuestion(template, questionId),
      }));
      onSaved?.(trimmedGroup);
    } catch (error) {
      setIsErrorMessage(true);
      setMessage(
        error instanceof Error ? error.message : "網路異常，儲存失敗",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!activeQuestion) return null;

  const greenLabel = activeQuestion.greenLabel ?? "最重要";
  const redLabel = activeQuestion.redLabel ?? "最易忽略";
  const maxGreen = activeQuestion.maxGreen ?? 5;
  const maxRed = activeQuestion.maxRed ?? 5;

  let greenCount = 0;
  let redCount = 0;
  const conflictOptions: string[] = [];

  for (const option of activeQuestion.options) {
    const counts = votes[questionId]?.[option] ?? { green: 0, red: 0 };
    if (counts.green > 0) greenCount += 1;
    if (counts.red > 0) redCount += 1;
    if (counts.green > 0 && counts.red > 0) conflictOptions.push(option);
  }

  const warnings: string[] = [];
  if (conflictOptions.length > 0) {
    warnings.push(
      `提醒：選項 ${conflictOptions.join("、")} 同時勾選綠與紅，請確認紙本`,
    );
  }
  if (greenCount > maxGreen || redCount > maxRed) {
    warnings.push(
      `提醒：目前綠 ${greenCount}/${maxGreen}、紅 ${redCount}/${maxRed}，超過常規上限，請確認紙本`,
    );
  }

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
            onChange={(event) => handleGroupIdChange(event.target.value)}
            placeholder="輸入組別數字"
            inputMode="numeric"
            maxLength={32}
            autoComplete="off"
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-5 py-4 text-2xl font-semibold outline-none ring-emerald-500/40 focus:ring-2"
          />
        </label>

        {existingBanner && (
          <div
            role="status"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            {existingBanner}
          </div>
        )}

        <section className="space-y-3">
          <div className="sticky top-0 z-[5] -mx-1 rounded-xl border border-slate-800/80 bg-slate-950/90 px-3 py-3 backdrop-blur">
            <h2 className="text-lg font-semibold leading-snug text-slate-100">
              {activeQuestion.label}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300">
                綠＝{greenLabel}（{greenCount}/{maxGreen}）
              </span>
              <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-rose-300">
                紅＝{redLabel}（{redCount}/{maxRed}）
              </span>
            </div>
            {warnings.length > 0 && (
              <div className="mt-2 space-y-1 text-xs text-amber-300">
                {warnings.map((w) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {activeQuestion.options.map((option) => {
              const counts = votes[questionId]?.[option] ?? {
                green: 0,
                red: 0,
              };
              return (
                <VoteCounter
                  key={option}
                  mode="checkbox"
                  label={option}
                  description={activeQuestion.optionLabels?.[option]}
                  greenLabel={greenLabel}
                  redLabel={redLabel}
                  green={counts.green > 0 ? 1 : 0}
                  red={counts.red > 0 ? 1 : 0}
                  onChange={(green, red) => {
                    dirtyRef.current = true;
                    setVotes((current) => ({
                      ...current,
                      [questionId]: {
                        ...current[questionId],
                        [option]: {
                          green: green > 0 ? 1 : 0,
                          red: red > 0 ? 1 : 0,
                        },
                      },
                    }));
                  }}
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
              className={`text-center text-sm ${
                isErrorMessage ? "text-rose-400" : "text-emerald-400"
              }`}
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
