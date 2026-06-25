import { emptyVotesForQuestion } from "@/lib/template";
import type { ThinkingMapTemplate, VoteCounts, VoteQuestion } from "@/lib/types";

export type LlmProvider = "openrouter" | "vertex";

export interface LlmRecognizeResult {
  votes: VoteCounts;
  confidence: number;
  model: string;
  provider: LlmProvider;
  rawNotes?: string;
}

export function getDefaultProvider(): LlmProvider {
  const value = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (value === "openrouter") return "openrouter";
  return "vertex";
}

export function buildRecognizePrompt(question: VoteQuestion) {
  const optionLines = question.options
    .map((option) => {
      const label = question.optionLabels?.[option] ?? option;
      return `  "${option}": "${label}"`;
    })
    .join("\n");

  return `你是 OGSTM 課堂思考圖表決的勾選框辨識助手。請分析附圖中「${question.label}」section a 的表決區。

規則：
1. 每一選項有兩個方框：左側綠框 = green，右側紅框 = red。
2. 每個 green/red 只能是 0（未勾）或 1（已勾）。藍筆、黑筆、打勾、塗黑都算已勾。
3. 只辨識 section a 的選項清單，忽略 b/c 開放題與其他區塊。
4. 同一選項的 green 和 red 可以同時為 0，但不應同時為 1（若同時為 1 請在 notes 說明）。

選項清單（代號與文字）：
${optionLines}

請只回傳 JSON，不要 markdown，格式如下：
{
  "votes": {
    "a": { "green": 0, "red": 1 }
  },
  "confidence": 0.85,
  "notes": "可選，簡短說明不確定的格子"
}

votes 必須包含所有選項：${question.options.map((o) => `"${o}"`).join(", ")}`;
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error("模型回傳非 JSON 格式");
  }
}

export function normalizeVotes(
  question: VoteQuestion,
  raw: unknown,
): { votes: VoteCounts; confidence: number; notes?: string } {
  if (!raw || typeof raw !== "object") {
    throw new Error("模型回傳格式錯誤");
  }

  const payload = raw as {
    votes?: Record<string, { green?: unknown; red?: unknown }>;
    confidence?: unknown;
    notes?: unknown;
  };

  const votes = emptyVotesForQuestion(
    { questions: [question] } as ThinkingMapTemplate,
    question.id,
  );

  for (const option of question.options) {
    const entry = payload.votes?.[option];
    const green = entry?.green === 1 || entry?.green === "1" ? 1 : 0;
    const red = entry?.red === 1 || entry?.red === "1" ? 1 : 0;
    votes[option] = { green, red };
  }

  let confidence =
    typeof payload.confidence === "number"
      ? Math.min(1, Math.max(0, payload.confidence))
      : 0.75;

  const bothChecked = question.options.filter((option) => {
    const counts = votes[option];
    return counts.green === 1 && counts.red === 1;
  }).length;

  if (bothChecked > 0) {
    confidence = Math.min(confidence, 0.55);
  }

  return {
    votes,
    confidence,
    notes: typeof payload.notes === "string" ? payload.notes : undefined,
  };
}

export async function fileToBase64(file: File): Promise<{
  base64: string;
  mimeType: string;
}> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    base64: buffer.toString("base64"),
    mimeType: file.type || "image/jpeg",
  };
}