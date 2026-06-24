import type {
  AggregatedOption,
  AggregatedQuestion,
  Session,
  Submission,
  ThinkingMapTemplate,
} from "./types";

export function aggregateSubmissions(
  session: Session,
  template: ThinkingMapTemplate,
  submissions: Submission[],
) {
  const questions: AggregatedQuestion[] = template.questions.map((question) => {
    const options: AggregatedOption[] = question.options.map((option) => {
      let green = 0;
      let red = 0;

      for (const submission of submissions) {
        const counts = submission.votes[question.id]?.[option];
        if (counts) {
          green += counts.green;
          red += counts.red;
        }
      }

      const total = green + red;
      return {
        option,
        green,
        red,
        total,
        greenRate: total > 0 ? Math.round((green / total) * 100) : 0,
      };
    });

    return {
      questionId: question.id,
      label: question.label,
      options,
    };
  });

  return {
    session,
    template,
    submissions,
    completedGroups: submissions.length,
    questions,
  };
}