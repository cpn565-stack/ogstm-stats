import type { AggregatedOption, AggregatedQuestion } from "./types";

export type SelectionVerdict = "approved" | "rejected" | "split" | "none";

export interface PresentedOption extends AggregatedOption {
  verdict: SelectionVerdict;
  rank: number;
}

export interface QuestionPresentation {
  questionId: string;
  label: string;
  options: PresentedOption[];
  topApproved: PresentedOption | null;
  approvedOptions: PresentedOption[];
  rejectedOptions: PresentedOption[];
}

function getVerdict(option: AggregatedOption): SelectionVerdict {
  if (option.total === 0) return "none";
  if (option.green > option.red) return "approved";
  if (option.red > option.green) return "rejected";
  return "split";
}

export function buildQuestionPresentation(
  question: AggregatedQuestion,
): QuestionPresentation {
  const ranked = [...question.options].sort((a, b) => {
    if (b.green !== a.green) return b.green - a.green;
    return a.red - b.red;
  });

  const options: PresentedOption[] = ranked.map((option, index) => ({
    ...option,
    verdict: getVerdict(option),
    rank: index + 1,
  }));

  const approvedOptions = options.filter(
    (option) => option.verdict === "approved" && option.green > 0,
  );
  const rejectedOptions = options.filter(
    (option) => option.verdict === "rejected" && option.red > 0,
  );

  return {
    questionId: question.questionId,
    label: question.label,
    options,
    topApproved: approvedOptions[0] ?? null,
    approvedOptions,
    rejectedOptions,
  };
}