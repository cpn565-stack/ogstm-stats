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
    <div className="space-y-3">
      <span className="text-sm font-medium text-slate-400">本次表決題目</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {questions.map((question) => {
          const isActive = question.id === selectedId;
          return (
            <button
              key={question.id}
              type="button"
              onClick={() => onChange(question.id)}
              className={`min-h-[4.5rem] cursor-pointer rounded-2xl px-4 py-4 text-left transition duration-200 active:scale-[0.99] ${
                isActive
                  ? "bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                  : "border border-slate-700 bg-slate-900 text-slate-200 active:bg-slate-800"
              }`}
            >
              <span className="block font-mono text-lg font-bold">
                {question.shortLabel ?? question.id}
              </span>
              <span
                className={`mt-1 block text-sm leading-snug ${isActive ? "text-slate-800" : "text-slate-400"}`}
              >
                {question.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">
        G 與 T 分開時段；同一組別可於不同時段分別儲存。
      </p>
    </div>
  );
}