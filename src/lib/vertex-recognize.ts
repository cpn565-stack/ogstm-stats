import { getTemplate } from "@/lib/template";
import {
  buildRecognizePrompt,
  extractJsonObject,
  normalizeVotes,
  type LlmRecognizeResult,
} from "@/lib/llm-recognize-shared";
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
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
      },
    }),
  });

  const payload = (await response.json()) as VertexResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `Vertex AI 錯誤 (${response.status})`,
    );
  }

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Vertex 模型未回傳內容");
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