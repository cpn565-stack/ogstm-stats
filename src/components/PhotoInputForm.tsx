"use client";

import { VoteCounter } from "@/components/VoteCounter";
import { recognizeFromImage } from "@/lib/recognize";
import { emptyVotes, getTemplate } from "@/lib/template";
import type { SubmissionVotes } from "@/lib/types";
import { useMemo, useState } from "react";

interface PhotoInputFormProps {
  sessionId: string;
  onSaved?: (groupId: string) => void;
}

export function PhotoInputForm({ sessionId, onSaved }: PhotoInputFormProps) {
  const template = useMemo(() => getTemplate(), []);
  const [groupId, setGroupId] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [votes, setVotes] = useState<SubmissionVotes>(emptyVotes(template));
  const [confidence, setConfidence] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setRecognizing(true);
    setMessage("");

    try {
      const result = await recognizeFromImage(file, template);
      setVotes(result.votes);
      setConfidence(result.confidence);

      if (result.confidence === 0) {
        setMessage(
          "模板 ROI 尚未標定，請手動確認票數。提供空白模板後可啟用自動辨識。",
        );
      } else if (result.confidence < 0.7) {
        setMessage("辨識信心偏低，請逐項確認後再儲存。");
      } else {
        setMessage("自動辨識完成，請確認結果。");
      }
    } catch {
      setMessage("圖片辨識失敗，請改用手動輸入票數。");
    } finally {
      setRecognizing(false);
    }
  }

  async function handleSave() {
    if (!groupId.trim()) {
      setMessage("請輸入組別");
      return;
    }

    setSaving(true);
    const response = await fetch(`/api/sessions/${sessionId}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: groupId.trim(),
        votes,
        source: "photo",
        confidence,
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
    setPreview(null);
    setGroupId("");
    setVotes(emptyVotes(template));
    setConfidence(0);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6">
        <label className="flex cursor-pointer flex-col items-center gap-3">
          <span className="text-lg font-semibold text-slate-100">
            拍照或上傳思考圖
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
          <p className="mt-4 text-center text-sm text-slate-400">辨識中…</p>
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

      {template.questions.map((question) => (
        <section key={question.id} className="space-y-3">
          <h2 className="text-xl font-semibold text-slate-100">
            {question.label}
            <span className="ml-2 text-sm font-normal text-slate-500">
              確認或修正辨識結果
            </span>
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
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="cursor-pointer rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "儲存中…" : "儲存並下一組"}
        </button>
        {confidence > 0 && (
          <span className="text-sm text-slate-400">
            辨識信心：{Math.round(confidence * 100)}%
          </span>
        )}
      </div>

      {message && <p className="text-sm text-amber-300">{message}</p>}
    </div>
  );
}