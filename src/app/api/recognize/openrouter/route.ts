import { requireOpsApi } from "@/lib/auth";
import { recognizeQuestionWithLlm } from "@/lib/llm-recognize";
import { parseAndValidateRecognizeRequest } from "@/lib/recognize-guard";
import { NextResponse } from "next/server";

export const maxDuration = 60;

/** 相容舊路徑，固定使用 OpenRouter */
export async function POST(request: Request) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;

  const parsed = await parseAndValidateRecognizeRequest(request, "openrouter");
  if (!parsed.ok) return parsed.response;

  try {
    const { imageBase64, mimeType, questionId } = parsed.value;
    const result = await recognizeQuestionWithLlm(
      imageBase64,
      mimeType,
      questionId,
      "openrouter",
    );
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "辨識失敗，請稍後再試";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
