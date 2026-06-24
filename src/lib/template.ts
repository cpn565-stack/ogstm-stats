import templateData from "@/data/template.json";
import type { SubmissionVotes, ThinkingMapTemplate, VoteCounts } from "./types";

export function getTemplate(): ThinkingMapTemplate {
  return templateData as ThinkingMapTemplate;
}

export function emptyVoteCounts(question: {
  options: string[];
}): VoteCounts {
  return Object.fromEntries(
    question.options.map((option) => [option, { green: 0, red: 0 }]),
  );
}

export function emptyVotes(template: ThinkingMapTemplate): SubmissionVotes {
  const votes: SubmissionVotes = {};
  for (const question of template.questions) {
    votes[question.id] = emptyVoteCounts(question);
  }
  return votes;
}

export function emptyVotesForQuestion(
  template: ThinkingMapTemplate,
  questionId: string,
): VoteCounts {
  const question = template.questions.find((item) => item.id === questionId);
  if (!question) return {};
  return emptyVoteCounts(question);
}

export function mergeSubmissionVotes(
  existing: SubmissionVotes,
  incoming: SubmissionVotes,
): SubmissionVotes {
  return { ...existing, ...incoming };
}