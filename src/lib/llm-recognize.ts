import {
  getDefaultProvider,
  type LlmProvider,
  type LlmRecognizeResult,
} from "@/lib/llm-recognize-shared";
import { recognizeQuestionWithOpenRouter } from "@/lib/openrouter-recognize";
import { recognizeQuestionWithVertex } from "@/lib/vertex-recognize";

export type { LlmProvider, LlmRecognizeResult };

export function resolveProvider(requested?: string): LlmProvider {
  const value = requested?.trim().toLowerCase();
  if (value === "openrouter" || value === "vertex") {
    return value;
  }
  return getDefaultProvider();
}

export async function recognizeQuestionWithLlm(
  imageBase64: string,
  mimeType: string,
  questionId: string,
  provider?: string,
): Promise<LlmRecognizeResult> {
  const resolved = resolveProvider(provider);

  if (resolved === "openrouter") {
    const result = await recognizeQuestionWithOpenRouter(
      imageBase64,
      mimeType,
      questionId,
    );
    return { ...result, provider: "openrouter" };
  }

  return recognizeQuestionWithVertex(imageBase64, mimeType, questionId);
}