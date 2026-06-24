"use client";

import type { VoteQuestion } from "@/lib/types";

interface QuestionPhasePickerProps {
  questions: VoteQuestion[];
  selectedId: string;
  onChange: (questionId: string) => void;
}

export function QuestionPhasePicker({
  questions,
  selectedId,
  onChange,
}: QuestionPhasePickerProps) {
  return (
    <div className="space-y-2">
      <span className="text-sm text-slate-400">本次表決題目</span>
      <div className="flex flex-wrap gap-2">
        {questions.map((question) => {
          const isActive = question.id === selectedId;
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onChange(question.id)}
              className={`cursor-pointer rounded-xl px-4 py-3 text-left transition ${
                isActive
                  ? "bg-emerald-500 text-slate-950"
                  : "border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500"
              }`}
            >
              <span className="block font-mono text-sm font-bold">
                {question.shortLabel ?? question.id}
              </span>
              <span
                className={`block text-sm ${isActive ? "text-slate-900" : "text-slate-400"}`}
              >
                {question.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-500">
        G 與 T 為分開時段，請選擇目前要輸入的題目。同一組別可於不同時段分別儲存。
      </p>
    </div>
  );
}