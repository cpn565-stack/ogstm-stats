import { getTemplate } from "@/lib/template";
import {
  buildRecognizePrompt,
  extractJsonObject,
  normalizeVotes,
  type LlmRecognizeResult,
} from "@/lib/llm-recognize-shared";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free";

interface OpenRouterChoice {
  message?: {
    content?: string | Array<{ type?: string; text?: string }>;
  };
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];
  error?: { message?: string };
}

function getModelId() {
  return process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

function extractTextContent(
  message: OpenRouterChoice["message"] | undefined,
): string {
  const content = message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text ?? "" : ""))
      .join("\n");
  }
  return "";
}

export async function recognizeQuestionWithOpenRouter(
  imageBase64: string,
  mimeType: string,
  questionId: string,
): Promise<LlmRecognizeResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("未設定 OPENROUTER_API_KEY");
  }

  const template = getTemplate();
  const question = template.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new Error("找不到題目");
  }

  const model = getModelId();
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://ogstm.spq.tw",
      "X-Title": "OGSTM Stats",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildRecognizePrompt(question) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  const payload = (await response.json()) as OpenRouterResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenRouter 錯誤 (${response.status})`);
  }

  const text = extractTextContent(payload.choices?.[0]?.message ?? undefined);
  if (!text) {
    throw new Error("模型未回傳內容");
  }

  const parsed = extractJsonObject(text);
  const normalized = normalizeVotes(question, parsed);

  return {
    votes: normalized.votes,
    confidence: normalized.confidence,
    model,
    provider: "openrouter",
    rawNotes: normalized.notes,
  };
}