import type { AggregatedOption, AggregatedQuestion } from "./types";

export type SelectionVerdict = "approved" | "rejected" | "split" | "none";

const TOP_N = 5;

export interface PresentedOption extends AggregatedOption {
  verdict: SelectionVerdict;
  rank: number;
  tied: boolean;
}

export interface QuestionPresentation {
  questionId: string;
  label: string;
  top5Green: PresentedOption[];
  top5Red: PresentedOption[];
}

function getVerdict(option: AggregatedOption): SelectionVerdict {
  if (option.total === 0) return "none";
  if (option.green > option.red) return "approved";
  if (option.red > option.green) return "rejected";
  return "split";
}

function assignCompetitionRanks(
  sorted: AggregatedOption[],
  score: (option: AggregatedOption) => number,
): PresentedOption[] {
  let rank = 1;

  const ranked = sorted.map((option, index) => {
    if (index > 0 && score(option) !== score(sorted[index - 1])) {
      rank = index + 1;
    }

    return {
      ...option,
      verdict: getVerdict(option),
      rank,
      tied: false,
    };
  });

  const rankCounts = new Map<number, number>();
  for (const option of ranked) {
    rankCounts.set(option.rank, (rankCounts.get(option.rank) ?? 0) + 1);
  }

  return ranked.map((option) => ({
    ...option,
    tied: (rankCounts.get(option.rank) ?? 0) > 1,
  }));
}

/** Top N by score; if the Nth place ties with others, include all tied options. */
function topNWithTies(
  options: AggregatedOption[],
  compare: (a: AggregatedOption, b: AggregatedOption) => number,
  score: (option: AggregatedOption) => number,
): PresentedOption[] {
  const sorted = [...options]
    .filter((option) => score(option) > 0)
    .sort(compare);

  if (sorted.length === 0) return [];
  if (sorted.length <= TOP_N) {
    return assignCompetitionRanks(sorted, score);
  }

  const cutoff = score(sorted[TOP_N - 1]);
  const included = sorted.filter((option) => score(option) >= cutoff);

  return assignCompetitionRanks(included, score);
}

function rankByGreen(options: AggregatedOption[]): PresentedOption[] {
  return topNWithTies(
    options,
    (a, b) => {
      if (b.green !== a.green) return b.green - a.green;
      if (a.red !== b.red) return a.red - b.red;
      return a.option.localeCompare(b.option);
    },
    (option) => option.green,
  );
}

function rankByRed(options: AggregatedOption[]): PresentedOption[] {
  return topNWithTies(
    options,
    (a, b) => {
      if (b.red !== a.red) return b.red - a.red;
      if (a.green !== b.green) return a.green - b.green;
      return a.option.localeCompare(b.option);
    },
    (option) => option.red,
  );
}

export function buildQuestionPresentation(
  question: AggregatedQuestion,
): QuestionPresentation {
  return {
    questionId: question.questionId,
    label: question.label,
    top5Green: rankByGreen(question.options),
    top5Red: rankByRed(question.options),
  };
}