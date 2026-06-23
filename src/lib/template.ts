import templateData from "@/data/template.json";
import type { SubmissionVotes, ThinkingMapTemplate, VoteCounts } from "./types";

export function getTemplate(): ThinkingMapTemplate {
  return templateData as ThinkingMapTemplate;
}

export function emptyVotes(template: ThinkingMapTemplate): SubmissionVotes {
  const votes: SubmissionVotes = {};
  for (const question of template.questions) {
    const counts: VoteCounts = {};
    for (const option of question.options) {
      counts[option] = { green: 0, red: 0 };
    }
    votes[question.id] = counts;
  }
  return votes;
}