import { aggregateSubmissions } from "./aggregate";
import { getSession, listSessions, listSubmissions } from "./store";
import { getTemplate } from "./template";
import type { Session, SessionStats, Submission } from "./types";

export interface SessionListItem {
  session: Session;
  submissionCount: number;
  totalGroups: number;
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
      totalGroups: stats.totalGroups,
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