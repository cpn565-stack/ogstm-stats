import type { LlmProvider } from "./llm-recognize-shared";
import { getTemplate } from "./template";
import { NextResponse } from "next/server";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_BASE64_LENGTH = 5_600_000;
export const MAX_REQUEST_CONTENT_LENGTH = 6_000_000;
export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const STRICT_BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export interface ValidatedRecognizeInput {
  imageBase64: string;
  mimeType: string;
  questionId: string;
  provider?: string;
}

export function estimateBase64DecodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function parseAndValidateRecognizeRequest(
  request: Request,
  forcedProvider?: LlmProvider,
): Promise<
  | { ok: true; value: ValidatedRecognizeInput }
  | { ok: false; response: NextResponse }
> {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength) {
    const byteLen = Number(rawContentLength);
    if (Number.isFinite(byteLen) && byteLen > MAX_REQUEST_CONTENT_LENGTH) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  let imageBase64 = "";
  let mimeType = "";
  let questionId = "";
  let provider: string | undefined = forcedProvider;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "表單圖片資料解析失敗" },
          { status: 400 },
        ),
      };
    }

    const file = form.get("image");
    questionId = String(form.get("questionId") ?? "").trim();
    if (!forcedProvider) {
      provider = String(form.get("provider") ?? "").trim() || undefined;
    }

    if (!(file instanceof File)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "請上傳圖片" }, { status: 400 }),
      };
    }
    if (file.size === 0) {
      return {
        ok: false,
        response: NextResponse.json({ error: "圖片檔案為空" }, { status: 400 }),
      };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }

    mimeType = file.type.trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "不支援的圖片格式，僅允許 JPEG、PNG 或 WebP" },
          { status: 415 },
        ),
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    imageBase64 = buffer.toString("base64");
  } else {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "請求內容並非合法的 JSON 格式" },
          { status: 400 },
        ),
      };
    }

    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "請求內容必須為 JSON 物件" },
          { status: 400 },
        ),
      };
    }

    const body = rawBody as Record<string, unknown>;
    questionId =
      typeof body.questionId === "string" ? body.questionId.trim() : "";
    if (!forcedProvider && typeof body.provider === "string") {
      provider = body.provider.trim() || undefined;
    }

    const rawMime =
      body.mimeType === undefined
        ? "image/jpeg"
        : typeof body.mimeType === "string"
          ? body.mimeType.trim().toLowerCase()
          : "";

    let rawB64 =
      typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
    const dataUrlMatch = rawB64.match(/^data:([^;]+);base64,([\s\S]+)$/i);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1]!.trim().toLowerCase();
      rawB64 = dataUrlMatch[2]!;
    } else {
      mimeType = rawMime;
    }

    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "不支援的圖片格式，僅允許 JPEG、PNG 或 WebP" },
          { status: 415 },
        ),
      };
    }

    imageBase64 = rawB64.replace(/\s+/g, "");
    if (!imageBase64) {
      return {
        ok: false,
        response: NextResponse.json({ error: "缺少圖片資料" }, { status: 400 }),
      };
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }
    if (
      imageBase64.length % 4 !== 0 ||
      !STRICT_BASE64_REGEX.test(imageBase64)
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片 Base64 編碼格式不合法" },
          { status: 400 },
        ),
      };
    }
    const decodedBytes = estimateBase64DecodedBytes(imageBase64);
    if (decodedBytes <= 0 || decodedBytes > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }
  }

  if (!questionId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "請指定題目" }, { status: 400 }),
    };
  }
  const validQuestion = getTemplate().questions.some((q) => q.id === questionId);
  if (!validQuestion) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "找不到指定的表決題目" },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    value: { imageBase64, mimeType, questionId, provider },
  };
}
