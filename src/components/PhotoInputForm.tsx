"use client";

import { QuestionPhasePicker } from "@/components/QuestionPhasePicker";
import { VoteCounter } from "@/components/VoteCounter";
import { apiPath } from "@/lib/paths";
import { recognizeQuestionFromImage } from "@/lib/recognize";
import { emptyVotesForQuestion, getTemplate } from "@/lib/template";
import type { VoteCounts } from "@/lib/types";
import { useMemo, useRef, useState } from "react";

interface PhotoInputFormProps {
  sessionId: string;
  onSaved?: (groupId: string) => void;
}

export function PhotoInputForm({ sessionId, onSaved }: PhotoInputFormProps) {
  const template = useMemo(() => getTemplate(), []);
  const [questionId, setQuestionId] = useState(template.questions[0]?.id ?? "");
  const [groupId, setGroupId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [votes, setVotes] = useState<VoteCounts>(() =>
    emptyVotesForQuestion(template, template.questions[0]?.id ?? ""),
  );
  const [confidence, setConfidence] = useState(0);
  const [recognizeSource, setRecognizeSource] = useState<
    "llm" | "local" | null
  >(null);
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const previewUrlRef = useRef<string | null>(null);

  const activeQuestion = template.questions.find(
    (question) => question.id === questionId,
  );

  const roiReady = Object.keys(template.rois ?? {}).length > 0;

  function handleQuestionChange(nextQuestionId: string) {
    setQuestionId(nextQuestionId);
    setVotes(emptyVotesForQuestion(template, nextQuestionId));
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setConfidence(0);
    setRecognizeSource(null);
    setMessage("");
  }

  function setRecognitionMessage(confidenceValue: number, notes?: string) {
    if (confidenceValue < 0.6) {
      setMessage(
        notes
          ? `AI 辨識信心偏低：${notes}。請逐項確認後再儲存。`
          : "AI 辨識信心偏低，請逐項確認後再儲存。",
      );
      return;
    }
    if (confidenceValue < 0.8) {
      setMessage("AI 已預填，請確認綠/紅勾選是否正確後再儲存。");
      return;
    }
    setMessage("AI 辨識完成，請確認結果後儲存。");
  }

  async function recognizeWithOpenRouter(file: File) {
    const form = new FormData();
    form.append("image", file);
    form.append("questionId", questionId);

    const response = await fetch(apiPath("/api/recognize/openrouter"), {
      method: "POST",
      body: form,
    });

    const data = (await response.json()) as {
      votes?: VoteCounts;
      confidence?: number;
      rawNotes?: string;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "AI 辨識失敗");
    }

    return data;
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !activeQuestion) return;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextPreview = URL.createObjectURL(file);
    previewUrlRef.current = nextPreview;
    setPreview(nextPreview);
    setRecognizing(true);
    setMessage("");
    setRecognizeSource(null);

    try {
      try {
        const llmResult = await recognizeWithOpenRouter(file);
        setVotes(llmResult.votes ?? emptyVotesForQuestion(template, questionId));
        setConfidence(llmResult.confidence ?? 0);
        setRecognizeSource("llm");
        setRecognitionMessage(llmResult.confidence ?? 0, llmResult.rawNotes);
        return;
      } catch (llmError) {
        if (!roiReady) {
          throw llmError;
        }
      }

      const localResult = await recognizeQuestionFromImage(
        file,
        template,
        questionId,
      );
      setVotes(localResult.votes);
      setConfidence(localResult.confidence);
      setRecognizeSource("local");

      if (localResult.confidence === 0) {
        setMessage("無法辨識此照片，請在下方勾選後儲存。");
      } else if (localResult.confidence < 0.7) {
        setMessage("本地辨識信心偏低，請逐項確認後再儲存。");
      } else {
        setMessage("本地辨識完成，請確認結果。");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message}。請在下方手動勾選後儲存。`
          : "圖片辨識失敗，請在下方手動勾選後儲存。",
      );
    } finally {
      setRecognizing(false);
      event.target.value = "";
    }
  }

  async function handleSave() {
    if (!groupId.trim()) {
      setMessage("請輸入組別");
      return;
    }
    if (!activeQuestion) {
      setMessage("請選擇題目");
      return;
    }

    setSaving(true);
    const response = await fetch(
      apiPath(`/api/sessions/${sessionId}/submissions`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: groupId.trim(),
          votes: {
            [questionId]: votes,
          },
          source: "photo",
          confidence,
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
    onSaved?.(groupId.trim());
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setVotes(emptyVotesForQuestion(template, questionId));
    setConfidence(0);
    setRecognizeSource(null);
  }

  if (!activeQuestion) return null;

  return (
    <div className="space-y-6">
      <QuestionPhasePicker
        questions={template.questions}
        selectedId={questionId}
        onChange={handleQuestionChange}
      />

      <p className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
        拍照後由 AI（Nemotron VL）自動預填綠/紅勾選，請務必確認後再儲存。
      </p>

      <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6">
        <label className="flex cursor-pointer flex-col items-center gap-3">
          <span className="text-lg font-semibold text-slate-100">
            拍照或上傳思考圖（{activeQuestion.shortLabel ?? questionId}）
          </span>
          <span className="text-sm text-slate-400">
            對準整張紙拍攝，光線均勻、避免陰影
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
          <span className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200">
            選擇照片
          </span>
        </label>
        {recognizing && (
          <p className="mt-4 text-center text-sm text-slate-400">
            AI 辨識中，約需 5–15 秒…
          </p>
        )}
      </div>

      {preview && (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="思考圖預覽"
            className="max-h-80 w-full bg-black object-contain"
          />
        </div>
      )}

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
          <span className="ml-2 text-sm font-normal text-slate-500">
            勾選各選項的綠/紅
          </span>
        </h2>
        <div className="space-y-2">
          {activeQuestion.options.map((option) => {
            const counts = votes[option] ?? { green: 0, red: 0 };
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
                    [option]: {
                      green: green > 0 ? 1 : 0,
                      red: red > 0 ? 1 : 0,
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
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="cursor-pointer rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "儲存中…" : "儲存並下一組"}
        </button>
        {confidence > 0 && (
          <span className="text-sm text-slate-400">
            {recognizeSource === "llm" ? "AI" : "本地"}辨識信心：
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {message && <p className="text-sm text-amber-300">{message}</p>}
    </div>
  );
}