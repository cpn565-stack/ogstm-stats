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
import { getVertexAccessToken } from "@/lib/vertex-auth";

const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_PROJECT = "ogstm-input";
const DEFAULT_LOCATION = "asia-southeast1";

interface VertexResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function getProjectId() {
  return process.env.GOOGLE_CLOUD_PROJECT?.trim() || DEFAULT_PROJECT;
}

function getLocation() {
  return process.env.GOOGLE_CLOUD_LOCATION?.trim() || DEFAULT_LOCATION;
}

function getModelId() {
  return process.env.VERTEX_GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function buildVertexResponseSchema(options: readonly string[]) {
  const voteProperties: Record<string, unknown> = {};
  for (const option of options) {
    voteProperties[option] = {
      type: "OBJECT",
      properties: {
        green: { type: "INTEGER" },
        red: { type: "INTEGER" },
      },
      required: ["green", "red"],
    };
  }

  return {
    type: "OBJECT",
    properties: {
      votes: {
        type: "OBJECT",
        properties: voteProperties,
        required: [...options],
      },
      confidence: { type: "NUMBER" },
      notes: { type: "STRING" },
    },
    required: ["votes", "confidence"],
  };
}

export async function recognizeQuestionWithVertex(
  imageBase64: string,
  mimeType: string,
  questionId: string,
): Promise<LlmRecognizeResult> {
  const template = getTemplate();
  const question = template.questions.find((item) => item.id === questionId);
  if (!question) {
    throw new Error("找不到題目");
  }

  const project = getProjectId();
  const location = getLocation();
  const model = getModelId();
  const accessToken = await getVertexAccessToken();

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: buildRecognizePrompt(question) },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          responseSchema: buildVertexResponseSchema(question.options),
        },
      }),
    });
  } catch (error) {
    if (isTimeoutOrAbortError(error)) {
      throw new Error("AI 辨識逾時，請重試、切換模型或直接手動勾選");
    }
    throw new Error("無法連線至 Vertex AI 服務，請改選 Nemotron VL 或手動勾選");
  }

  const rawBody = await response.text();
  const payload = parseUpstreamJson<VertexResponse>(
    rawBody,
    response.status,
    "Gemini",
  );
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "Gemini AI 請求配額暫時達到上限 (429)，請改選 Nemotron VL 或直接手動勾選",
      );
    }
    throw new Error(
      payload.error?.message
        ? `Vertex AI 錯誤 (${response.status})：${payload.error.message}`
        : `Vertex AI 服務暫時無法使用 (${response.status})，請改選另一模型或手動勾選`,
    );
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Vertex 模型未回傳內容，請重試或直接手動勾選");
  }

  const parsed = extractJsonObject(text);
  const normalized = normalizeVotes(question, parsed);

  return {
    votes: normalized.votes,
    confidence: normalized.confidence,
    model,
    provider: "vertex",
    rawNotes: normalized.notes,
  };
}
