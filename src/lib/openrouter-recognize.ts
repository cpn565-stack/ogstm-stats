import {
  buildRecognizePrompt,
  extractJsonObject,
  isTimeoutOrAbortError,
  normalizeVotes,
  parseUpstreamJson,
  UPSTREAM_TIMEOUT_MS,
  type LlmRecognizeResult,
} from "@/lib/llm-recognize-shared";
import { getTemplate } from "@/lib/template";

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
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
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
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("伺服器尚未設定 OPENROUTER_API_KEY，請改選 Gemini 或手動輸入");
  }

  const template = getTemplate();
  const question = template.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new Error("找不到題目");
  }

  const model = getModelId();
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://ogstm.spq.tw",
        "X-Title": "OGSTM Stats",
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
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
  } catch (error) {
    if (isTimeoutOrAbortError(error)) {
      throw new Error("AI 辨識逾時，請重試、切換模型或直接手動勾選");
    }
    throw new Error("無法連線至 OpenRouter 服務，請改選 Gemini 或手動勾選");
  }

  const rawBody = await response.text();
  const payload = parseUpstreamJson<OpenRouterResponse>(
    rawBody,
    response.status,
    "OpenRouter",
  );
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "Nemotron VL 免費節點目前忙碌 (429)，請改選 Gemini 或直接手動勾選",
      );
    }
    throw new Error(
      payload.error?.message
        ? `OpenRouter 錯誤 (${response.status})：${payload.error.message}`
        : `OpenRouter 服務暫時無法使用 (${response.status})，請改選另一模型或手動勾選`,
    );
  }

  const text = extractTextContent(payload.choices?.[0]?.message ?? undefined);
  if (!text) {
    throw new Error("模型未回傳內容，請重試或直接手動勾選");
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
