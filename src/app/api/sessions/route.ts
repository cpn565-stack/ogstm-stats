import { requireOpsApi } from "@/lib/auth";
import { createSession, listSessions } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { NextResponse } from "next/server";

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;
  return NextResponse.json(
    { sessions: listSessions() },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;

  const rawText = await request.text();
  let rawName = "";

  if (rawText.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        { error: "請求內容並非合法的 JSON 格式" },
        { status: 400 },
      );
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "請求內容必須為 JSON 物件" },
        { status: 400 },
      );
    }
    const body = parsed as Record<string, unknown>;
    if (body.name !== undefined && typeof body.name !== "string") {
      return NextResponse.json(
        { error: "課程名稱必須為字串" },
        { status: 400 },
      );
    }
    if (typeof body.name === "string") {
      rawName = body.name.trim();
      if (rawName.length > 120 || CONTROL_CHAR_REGEX.test(rawName)) {
        return NextResponse.json(
          { error: "課程名稱格式不合法（上限 120 字元且不含控制字元）" },
          { status: 400 },
        );
      }
    }
  }

  const name = rawName || `課程 ${new Date().toLocaleString("zh-TW")}`;
  const template = getTemplate();
  const session = createSession(name, template.id);
  return NextResponse.json({ session }, { status: 201 });
}
