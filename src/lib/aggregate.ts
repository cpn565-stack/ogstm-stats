import type {
  AggregatedOption,
  AggregatedQuestion,
  Session,
  SessionStats,
  Submission,
  ThinkingMapTemplate,
} from "./types";

export function aggregateSubmissions(
  session: Session,
  template: ThinkingMapTemplate,
  submissions: Submission[],
): SessionStats {
  const questions: AggregatedQuestion[] = template.questions.map((question) => {
    const options: AggregatedOption[] = question.options.map((option) => {
      let green = 0;
      let red = 0;

      for (const submission of submissions) {
        const counts = submission.votes?.[question.id]?.[option];
        if (counts) {
          const g = Number(counts.green);
          const r = Number(counts.red);
          if (Number.isFinite(g) && g > 0) green += Math.trunc(g);
          if (Number.isFinite(r) && r > 0) red += Math.trunc(r);
        }
      }

      const total = green + red;
      return {
        option,
        optionLabel: question.optionLabels?.[option],
        green,
        red,
        total,
        greenRate: total > 0 ? Math.round((green / total) * 100) : 0,
      };
    });

    return {
      questionId: question.id,
      label: question.label,
      greenLabel: question.greenLabel ?? "最重要",
      redLabel: question.redLabel ?? "最易忽略",
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

/**
 * 對免登入講師投影／輪詢連結脫敏各組原始勾選明細（保留彙整數據與各組完成狀態／信心分數）
 */
export function redactStatsForPublicLink(stats: SessionStats): SessionStats {
  return {
    ...stats,
    submissions: stats.submissions.map((sub) => ({
      id: sub.id,
      sessionId: sub.sessionId,
      groupId: sub.groupId,
      votes: {},
      source: sub.source,
      ...(sub.confidence !== undefined ? { confidence: sub.confidence } : {}),
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    })),
  };
}
