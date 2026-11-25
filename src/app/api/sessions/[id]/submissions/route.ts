import { requireOpsApi } from "@/lib/auth";
import { parseJsonObject } from "@/lib/http";
import { getSession, listSubmissions, upsertSubmission } from "@/lib/store";
import { getTemplate, sanitizeSubmissionVotes } from "@/lib/template";
import type { SubmissionSource } from "@/lib/types";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;

  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }
  return NextResponse.json(
    { submissions: listSubmissions(id) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, context: RouteContext) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;

  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  if (!groupId) {
    return NextResponse.json({ error: "請輸入組別" }, { status: 400 });
  }
  if (groupId.length > 32 || CONTROL_CHAR_REGEX.test(groupId)) {
    return NextResponse.json(
      { error: "組別名稱格式不合法（限 1–32 字元且不含控制字元）" },
      { status: 400 },
    );
  }

  const rawSource = body.source ?? "manual";
  if (rawSource !== "manual" && rawSource !== "photo") {
    return NextResponse.json(
      { error: "來源類型錯誤，僅允許 manual 或 photo" },
      { status: 400 },
    );
  }
  const source: SubmissionSource = rawSource;

  let confidence: number | undefined;
  if (body.confidence !== undefined) {
    if (
      typeof body.confidence !== "number" ||
      !Number.isFinite(body.confidence) ||
      body.confidence < 0 ||
      body.confidence > 1
    ) {
      return NextResponse.json(
        { error: "辨識信心分數必須為 0 到 1 之間的數值" },
        { status: 400 },
      );
    }
    confidence = body.confidence;
  }

  let photoPath: string | undefined;
  if (body.photoPath !== undefined) {
    if (
      typeof body.photoPath !== "string" ||
      body.photoPath.length > 256 ||
      CONTROL_CHAR_REGEX.test(body.photoPath)
    ) {
      return NextResponse.json(
        { error: "照片路徑格式不合法" },
        { status: 400 },
      );
    }
    photoPath = body.photoPath;
  }

  const voteCheck = sanitizeSubmissionVotes(getTemplate(), body.votes);
  if (!voteCheck.ok) {
    return NextResponse.json({ error: voteCheck.error }, { status: 400 });
  }

  const submission = upsertSubmission({
    sessionId: id,
    groupId,
    votes: voteCheck.votes,
    source,
    confidence,
    photoPath,
  });

  return NextResponse.json({ submission }, { status: 201 });
}
