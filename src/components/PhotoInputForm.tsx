"use client";

import { QuestionPhasePicker } from "@/components/QuestionPhasePicker";
import { VoteCounter } from "@/components/VoteCounter";
import { blobToBase64, compressImageForUpload } from "@/lib/compress-image";
import { readJsonResponse } from "@/lib/fetch-json";
import { apiPath } from "@/lib/paths";
import { recognizeQuestionFromImage } from "@/lib/recognize";
import { emptyVotesForQuestion, getTemplate } from "@/lib/template";
import type { Submission, VoteCounts } from "@/lib/types";
import { useEffect, useMemo, useRef, useState } from "react";

type LlmProvider = "vertex" | "openrouter";
type MessageTone = "info" | "success" | "error";

const DEFAULT_LLM_PROVIDER: LlmProvider =
  process.env.NEXT_PUBLIC_LLM_PROVIDER === "openrouter"
    ? "openrouter"
    : "vertex";

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
  const [llmProvider, setLlmProvider] =
    useState<LlmProvider>(DEFAULT_LLM_PROVIDER);
  const [recognizeSource, setRecognizeSource] = useState<
    "llm" | "local" | null
  >(null);
  const [recognizeProvider, setRecognizeProvider] =
    useState<LlmProvider | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("info");
  const [existingBanner, setExistingBanner] = useState("");

  const previewUrlRef = useRef<string | null>(null);
  const recognizeAbortRef = useRef<AbortController | null>(null);
  const userCancelledRef = useRef(false);
  const dirtyOrPrefilledRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const activeQuestion = template.questions.find(
    (question) => question.id === questionId,
  );

  const roiReady = Object.keys(template.rois ?? {}).length > 0;

  useEffect(() => {
    return () => {
      recognizeAbortRef.current?.abort();
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

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
          setMessageTone("error");
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

        if (dirtyOrPrefilledRef.current) {
          setExistingBanner(
            `注意：第 ${trimmed} 組已有紀錄，儲存將覆寫該組此題資料`,
          );
        } else {
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
          setVotes(merged);
          setExistingBanner(
            `第 ${trimmed} 組已有紀錄，已載入既有勾選；儲存將覆寫更新`,
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
    if (!dirtyOrPrefilledRef.current) {
      setVotes(emptyVotesForQuestion(template, questionId));
    }
  }

  function handleQuestionChange(nextQuestionId: string) {
    recognizeAbortRef.current?.abort();
    setRecognizing(false);
    setQuestionId(nextQuestionId);
    setVotes(emptyVotesForQuestion(template, nextQuestionId));
    dirtyOrPrefilledRef.current = false;
    setExistingBanner("");
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    setConfidence(0);
    setRecognizeSource(null);
    setRecognizeProvider(null);
    setMessage("");
  }

  function handleCancelRecognize() {
    userCancelledRef.current = true;
    recognizeAbortRef.current?.abort();
    setRecognizing(false);
    setMessageTone("info");
    setMessage("已取消 AI 辨識，請直接在下方手動勾選後儲存。");
  }

  function setRecognitionMessage(confidenceValue: number, notes?: string) {
    setMessageTone("info");
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

  async function recognizeWithLlm(
    file: File,
    provider: LlmProvider,
    signal: AbortSignal,
  ) {
    const { blob, mimeType } = await compressImageForUpload(file);
    const imageBase64 = await blobToBase64(blob);

    const response = await fetch(apiPath("/api/recognize"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        questionId,
        imageBase64,
        mimeType,
        provider,
      }),
    });

    if (response.status === 401) {
      throw new Error("登入已過期，請重新整理並登入營運頁面");
    }

    const data = await readJsonResponse<{
      votes?: VoteCounts;
      confidence?: number;
      provider?: LlmProvider;
      model?: string;
      rawNotes?: string;
      error?: string;
    }>(response);

    if (!response.ok) {
      throw new Error(data.error ?? "AI 辨識失敗");
    }

    return data;
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !activeQuestion) return;

    recognizeAbortRef.current?.abort();
    const controller = new AbortController();
    recognizeAbortRef.current = controller;
    userCancelledRef.current = false;

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const nextPreview = URL.createObjectURL(file);
    previewUrlRef.current = nextPreview;
    setPreview(nextPreview);
    setRecognizing(true);
    setMessage("");
    setRecognizeSource(null);
    setRecognizeProvider(null);

    try {
      try {
        const llmResult = await recognizeWithLlm(
          file,
          llmProvider,
          controller.signal,
        );
        dirtyOrPrefilledRef.current = true;
        setVotes(llmResult.votes ?? emptyVotesForQuestion(template, questionId));
        setConfidence(llmResult.confidence ?? 0);
        setRecognizeSource("llm");
        setRecognizeProvider(llmResult.provider ?? llmProvider);
        setRecognitionMessage(llmResult.confidence ?? 0, llmResult.rawNotes);
        return;
      } catch (llmError) {
        if (
          userCancelledRef.current ||
          (llmError as { name?: string })?.name === "AbortError"
        ) {
          return;
        }
        if (!roiReady) {
          throw llmError;
        }
      }

      const localResult = await recognizeQuestionFromImage(
        file,
        template,
        questionId,
      );
      dirtyOrPrefilledRef.current = true;
      setVotes(localResult.votes);
      setConfidence(localResult.confidence);
      setRecognizeSource("local");
      setMessageTone("info");

      if (localResult.confidence === 0) {
        setMessage("無法辨識此照片，請在下方勾選後儲存。");
      } else if (localResult.confidence < 0.7) {
        setMessage("本地辨識信心偏低，請逐項確認後再儲存。");
      } else {
        setMessage("本地辨識完成，請確認結果。");
      }
    } catch (error) {
      if (userCancelledRef.current) return;
      setMessageTone("error");
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
    const trimmedGroup = groupId.trim();
    if (!trimmedGroup) {
      setMessageTone("error");
      setMessage("請輸入組別");
      return;
    }
    if (!activeQuestion) {
      setMessageTone("error");
      setMessage("請選擇題目");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        apiPath(`/api/sessions/${sessionId}/submissions`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: trimmedGroup,
            votes: {
              [questionId]: votes,
            },
            source: "photo",
            confidence,
          }),
        },
      );

      if (response.status === 401) {
        setMessageTone("error");
        setMessage("登入已過期，請重新整理並登入營運頁面");
        return;
      }

      const data = await readJsonResponse<{
        submission?: Submission;
        error?: string;
      }>(response);

      if (!response.ok) {
        setMessageTone("error");
        setMessage(data.error ?? "儲存失敗");
        return;
      }

      setMessageTone("success");
      setMessage(
        `✓ 已儲存 ${activeQuestion.shortLabel ?? questionId} · 第 ${trimmedGroup} 組，請輸入下一組組別`,
      );
      onSaved?.(trimmedGroup);
      setGroupId("");
      setExistingBanner("");
      dirtyOrPrefilledRef.current = false;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setPreview(null);
      setVotes(emptyVotesForQuestion(template, questionId));
      setConfidence(0);
      setRecognizeSource(null);
      setRecognizeProvider(null);
    } catch (error) {
      setMessageTone("error");
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
    const counts = votes[option] ?? { green: 0, red: 0 };
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

  const messageColorClass =
    messageTone === "error"
      ? "text-rose-400"
      : messageTone === "success"
        ? "text-emerald-400"
        : "text-amber-300";

  return (
    <div className="space-y-6">
      <QuestionPhasePicker
        questions={template.questions}
        selectedId={questionId}
        onChange={handleQuestionChange}
      />

      <div className="space-y-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
        <p className="text-sm text-sky-100">
          拍照後由 AI 自動預填綠/紅勾選，請務必確認後再儲存。
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLlmProvider("vertex")}
            className={`min-h-[44px] cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition ${
              llmProvider === "vertex"
                ? "bg-sky-500 text-slate-950"
                : "bg-slate-900/60 text-slate-300 hover:bg-slate-900"
            }`}
          >
            Gemini 3.5 Flash
          </button>
          <button
            type="button"
            onClick={() => setLlmProvider("openrouter")}
            className={`min-h-[44px] cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition ${
              llmProvider === "openrouter"
                ? "bg-sky-500 text-slate-950"
                : "bg-slate-900/60 text-slate-300 hover:bg-slate-900"
            }`}
          >
            Nemotron VL
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-lg font-semibold text-slate-100">
            拍照或上傳思考圖（{activeQuestion.shortLabel ?? questionId}）
          </span>
          <span className="text-sm text-slate-400">
            對準整張紙拍攝，光線均勻、避免陰影
          </span>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="grid w-full max-w-sm grid-cols-2 gap-3">
            <button
              type="button"
              disabled={recognizing}
              onClick={() => cameraInputRef.current?.click()}
              className="min-h-[52px] cursor-pointer rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 active:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              拍照
            </button>
            <button
              type="button"
              disabled={recognizing}
              onClick={() => galleryInputRef.current?.click()}
              className="min-h-[52px] cursor-pointer rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 active:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              選擇照片
            </button>
          </div>
        </div>
        {recognizing && (
          <div className="mt-4 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-slate-400">
              AI 辨識中，約需 5–15 秒…
            </p>
            <button
              type="button"
              onClick={handleCancelRecognize}
              className="cursor-pointer rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
            >
              取消 AI 辨識（直接手動勾選）
            </button>
          </div>
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
          onChange={(event) => handleGroupIdChange(event.target.value)}
          placeholder="例如：3"
          maxLength={32}
          autoComplete="off"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none ring-emerald-500/40 focus:ring-2"
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
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/90 px-4 py-3">
          <h2 className="text-xl font-semibold text-slate-100">
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

        <div className="space-y-2">
          {activeQuestion.options.map((option) => {
            const counts = votes[option] ?? { green: 0, red: 0 };
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
                  dirtyOrPrefilledRef.current = true;
                  setVotes((current) => ({
                    ...current,
                    [option]: {
                      green: green > 0 ? 1 : 0,
                      red: red > 0 ? 1 : 0,
                    },
                  }));
                }}
              />
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="cursor-pointer rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "儲存中…" : "儲存並下一組"}
        </button>
        {confidence > 0 && (
          <span className="text-sm text-slate-400">
            {recognizeSource === "llm"
              ? recognizeProvider === "vertex"
                ? "Gemini 3.5 Flash"
                : "Nemotron VL"
              : "本地"}
            辨識信心：{Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {message && (
        <p className={`text-sm ${messageColorClass}`} role="status">
          {message}
        </p>
      )}
    </div>
  );
}
