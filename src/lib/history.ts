import { aggregateSubmissions } from "./aggregate";
import { buildQuestionPresentation } from "./presenter";
import { getSession, listSessions, listSubmissions } from "./store";
import { getTemplate } from "./template";
import type {
  AggregatedQuestion,
  Session,
  SessionStats,
  Submission,
} from "./types";

export interface SessionListItem {
  session: Session;
  submissionCount: number;
  topApproved: Record<string, string | null>;
}

export interface HistoricalOptionRow {
  questionId: string;
  questionLabel: string;
  option: string;
  totalGreen: number;
  totalRed: number;
  totalVotes: number;
  greenRate: number;
  sessionCount: number;
}

export interface HistoryOverview {
  sessions: SessionListItem[];
  historicalOptions: HistoricalOptionRow[];
  totalSessions: number;
  totalSubmissions: number;
}

function getTopApproved(stats: SessionStats): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const question of stats.questions) {
    const sorted = [...question.options].sort((a, b) => b.green - a.green);
    const top = sorted.find((option) => option.green > 0);
    result[question.questionId] = top?.option ?? null;
  }
  return result;
}

export function getSessionStats(sessionId: string): SessionStats | null {
  const session = getSession(sessionId);
  if (!session) return null;
  const template = getTemplate();
  const submissions = listSubmissions(sessionId);
  return aggregateSubmissions(session, template, submissions);
}

export function buildHistoryOverview(): HistoryOverview {
  const sessions = listSessions();
  const template = getTemplate();
  const sessionItems: SessionListItem[] = [];
  const historicalMap = new Map<
    string,
    HistoricalOptionRow & { sessionIds: Set<string> }
  >();

  let totalSubmissions = 0;

  for (const session of sessions) {
    const submissions = listSubmissions(session.id);
    totalSubmissions += submissions.length;
    const stats = aggregateSubmissions(session, template, submissions);

    sessionItems.push({
      session,
      submissionCount: submissions.length,
      topApproved: getTopApproved(stats),
    });

    for (const question of stats.questions) {
      for (const option of question.options) {
        const key = `${question.questionId}:${option.option}`;
        const existing = historicalMap.get(key);
        if (existing) {
          existing.totalGreen += option.green;
          existing.totalRed += option.red;
          existing.totalVotes += option.total;
          if (option.total > 0) existing.sessionIds.add(session.id);
        } else {
          historicalMap.set(key, {
            questionId: question.questionId,
            questionLabel: question.label,
            option: option.option,
            totalGreen: option.green,
            totalRed: option.red,
            totalVotes: option.total,
            greenRate: 0,
            sessionCount: option.total > 0 ? 1 : 0,
            sessionIds: new Set(option.total > 0 ? [session.id] : []),
          });
        }
      }
    }
  }

  const historicalOptions = [...historicalMap.values()]
    .map((row) => {
      const total = row.totalGreen + row.totalRed;
      return {
        questionId: row.questionId,
        questionLabel: row.questionLabel,
        option: row.option,
        totalGreen: row.totalGreen,
        totalRed: row.totalRed,
        totalVotes: row.totalVotes,
        greenRate: total > 0 ? Math.round((row.totalGreen / total) * 100) : 0,
        sessionCount: row.sessionIds.size,
      };
    })
    .sort((a, b) => {
      if (a.questionId !== b.questionId) {
        return a.questionId.localeCompare(b.questionId);
      }
      return b.totalGreen - a.totalGreen;
    });

  return {
    sessions: sessionItems,
    historicalOptions,
    totalSessions: sessions.length,
    totalSubmissions,
  };
}

export interface PublicQuestionSummary {
  questionId: string;
  label: string;
  top5Green: Array<{
    option: string;
    label: string;
    green: number;
    rank: number;
    tied: boolean;
  }>;
  top5Red: Array<{
    option: string;
    label: string;
    red: number;
    rank: number;
    tied: boolean;
  }>;
}

export interface PublicSummary {
  totalSessions: number;
  totalSubmissions: number;
  questions: PublicQuestionSummary[];
  highlights: string[];
}

function historicalToQuestions(
  historicalOptions: HistoricalOptionRow[],
  template: ReturnType<typeof getTemplate>,
): AggregatedQuestion[] {
  return template.questions.map((question) => ({
    questionId: question.id,
    label: question.label,
    options: question.options.map((option) => {
      const row = historicalOptions.find(
        (item) => item.questionId === question.id && item.option === option,
      );
      const green = row?.totalGreen ?? 0;
      const red = row?.totalRed ?? 0;
      const total = green + red;
      return {
        option,
        green,
        red,
        total,
        greenRate: total > 0 ? Math.round((green / total) * 100) : 0,
      };
    }),
  }));
}

export function buildPublicSummary(): PublicSummary {
  const overview = buildHistoryOverview();
  const template = getTemplate();
  const questions = historicalToQuestions(overview.historicalOptions, template);
  const highlights: string[] = [];

  const questionSummaries: PublicQuestionSummary[] = questions.map(
    (question) => {
      const templateQuestion = template.questions.find(
        (item) => item.id === question.questionId,
      );
      const optionLabels = templateQuestion?.optionLabels ?? {};
      const presentation = buildQuestionPresentation(question);

      const top5Green = presentation.top5Green.map((item) => ({
        option: item.option,
        label: optionLabels[item.option] ?? item.option,
        green: item.green,
        rank: item.rank,
        tied: item.tied,
      }));

      const top5Red = presentation.top5Red.map((item) => ({
        option: item.option,
        label: optionLabels[item.option] ?? item.option,
        red: item.red,
        rank: item.rank,
        tied: item.tied,
      }));

      const topGreen = top5Green[0];
      const topRed = top5Red[0];
      if (topGreen) {
        highlights.push(
          `${question.label}：最常見贊成為「${topGreen.label}」（${topGreen.green} 票）`,
        );
      }
      if (topRed) {
        highlights.push(
          `${question.label}：最常見反對為「${topRed.label}」（${topRed.red} 票）`,
        );
      }

      return {
        questionId: question.questionId,
        label: question.label,
        top5Green,
        top5Red,
      };
    },
  );

  return {
    totalSessions: overview.totalSessions,
    totalSubmissions: overview.totalSubmissions,
    questions: questionSummaries,
    highlights,
  };
}

export function flattenSubmissionRows(
  submissions: Submission[],
  stats: SessionStats,
) {
  return submissions.map((submission) => ({
    submission,
    votesByQuestion: stats.template.questions.map((question) => ({
      questionId: question.id,
      label: question.label,
      options: question.options.map((option) => ({
        option,
        counts: submission.votes[question.id]?.[option] ?? {
          green: 0,
          red: 0,
        },
      })),
    })),
  }));
}