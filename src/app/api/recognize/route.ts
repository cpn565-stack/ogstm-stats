import { fileToBase64 } from "@/lib/llm-recognize-shared";
import { recognizeQuestionWithLlm } from "@/lib/llm-recognize";
import { NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let imageBase64 = "";
    let mimeType = "image/jpeg";
    let questionId = "";
    let provider: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      questionId = String(form.get("questionId") ?? "").trim();
      provider = String(form.get("provider") ?? "").trim() || undefined;

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "請上傳圖片" }, { status: 400 });
      }

      const encoded = await fileToBase64(file);
      imageBase64 = encoded.base64;
      mimeType = encoded.mimeType;
    } else {
      const body = (await request.json()) as {
        imageBase64?: string;
        mimeType?: string;
        questionId?: string;
        provider?: string;
      };

      imageBase64 = body.imageBase64?.trim() ?? "";
      mimeType = body.mimeType?.trim() || "image/jpeg";
      questionId = body.questionId?.trim() ?? "";
      provider = body.provider?.trim() || undefined;
    }

    if (!questionId) {
      return NextResponse.json({ error: "請指定題目" }, { status: 400 });
    }
    if (!imageBase64) {
      return NextResponse.json({ error: "缺少圖片資料" }, { status: 400 });
    }

    const result = await recognizeQuestionWithLlm(
      imageBase64,
      mimeType,
      questionId,
      provider,
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "辨識失敗，請稍後再試";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}