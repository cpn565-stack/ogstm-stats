import templateData from "@/data/template.json";
import type {
  SubmissionVotes,
  ThinkingMapTemplate,
  VoteCounts,
} from "./types";

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

const FORBIDDEN_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isBinaryVoteInt(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

export type SanitizeVotesResult =
  | { ok: true; votes: SubmissionVotes }
  | { ok: false; error: string };

/**
 * 嚴格驗證並正規化小組提交票數：
 * - 僅允許存在於 template.questions 之題號與該題合法 options
 * - 傳入之每格 green / red 必須為嚴格整數 0 或 1（拒絕字串 "1"、負數、>1、浮點數、布林值）
 * - 未傳入之同題其他選項自動補齊 { green: 0, red: 0 }
 */
export function sanitizeSubmissionVotes(
  template: ThinkingMapTemplate,
  rawVotes: unknown,
): SanitizeVotesResult {
  if (!isPlainRecord(rawVotes)) {
    return { ok: false, error: "缺少有效題目票數資料" };
  }

  for (const forbidden of FORBIDDEN_OBJECT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rawVotes, forbidden)) {
      return { ok: false, error: "票數資料包含不合法的屬性鍵值" };
    }
  }

  const questionEntries = Object.entries(rawVotes);
  if (questionEntries.length === 0) {
    return { ok: false, error: "缺少有效題目票數資料" };
  }

  const questionMap = new Map(
    template.questions.map((question) => [question.id, question]),
  );
  const sanitized: SubmissionVotes = {};

  for (const [questionId, rawOptionMap] of questionEntries) {
    if (FORBIDDEN_OBJECT_KEYS.has(questionId)) {
      return { ok: false, error: "票數資料包含不合法的屬性鍵值" };
    }
    const question = questionMap.get(questionId);
    if (!question) {
      return { ok: false, error: `未知的題目代號：${questionId}` };
    }
    if (!isPlainRecord(rawOptionMap)) {
      return { ok: false, error: `題目 ${questionId} 的選項票數必須為物件` };
    }

    for (const forbidden of FORBIDDEN_OBJECT_KEYS) {
      if (Object.prototype.hasOwnProperty.call(rawOptionMap, forbidden)) {
        return { ok: false, error: `題目 ${questionId} 含未知選項：${forbidden}` };
      }
    }

    const allowedOptions = new Set(question.options);
    for (const optKey of Object.keys(rawOptionMap)) {
      if (FORBIDDEN_OBJECT_KEYS.has(optKey) || !allowedOptions.has(optKey)) {
        return { ok: false, error: `題目 ${questionId} 含未知選項：${optKey}` };
      }
    }

    const normalizedCounts: VoteCounts = {};
    for (const option of question.options) {
      const entry = rawOptionMap[option];
      if (entry === undefined) {
        normalizedCounts[option] = { green: 0, red: 0 };
        continue;
      }
      if (!isPlainRecord(entry)) {
        return {
          ok: false,
          error: `票數格式錯誤（${questionId}.${option}）：必須為含 green 與 red 之物件`,
        };
      }
      if (!isBinaryVoteInt(entry.green) || !isBinaryVoteInt(entry.red)) {
        return {
          ok: false,
          error: `票數格式錯誤（${questionId}.${option}）：每格僅允許整數 0 或 1`,
        };
      }
      normalizedCounts[option] = {
        green: entry.green === 1 ? 1 : 0,
        red: entry.red === 1 ? 1 : 0,
      };
    }

    sanitized[questionId] = normalizedCounts;
  }

  return { ok: true, votes: sanitized };
}

export function validateAndNormalizeVotes(
  template: ThinkingMapTemplate,
  rawVotes: unknown,
): SubmissionVotes | null {
  const result = sanitizeSubmissionVotes(template, rawVotes);
  return result.ok ? result.votes : null;
}
