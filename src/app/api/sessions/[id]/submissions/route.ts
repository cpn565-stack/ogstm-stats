import { getSession, listSubmissions, upsertSubmission } from "@/lib/store";
import type { SubmissionSource, SubmissionVotes } from "@/lib/types";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }
  return NextResponse.json({ submissions: listSubmissions(id) });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }

  const body = (await request.json()) as {
    groupId?: string;
    votes?: SubmissionVotes;
    source?: SubmissionSource;
    confidence?: number;
    photoPath?: string;
  };

  const groupId = body.groupId?.trim();
  if (!groupId) {
    return NextResponse.json({ error: "請輸入組別" }, { status: 400 });
  }
  if (!body.votes) {
    return NextResponse.json({ error: "缺少票數資料" }, { status: 400 });
  }

  const submission = upsertSubmission({
    sessionId: id,
    groupId,
    votes: body.votes,
    source: body.source ?? "manual",
    confidence: body.confidence,
    photoPath: body.photoPath,
  });

  return NextResponse.json({ submission }, { status: 201 });
}