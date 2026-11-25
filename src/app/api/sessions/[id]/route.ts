import {
  aggregateSubmissions,
  redactStatsForPublicLink,
} from "@/lib/aggregate";
import {
  getOpsSession,
  requireAdminApi,
  requireOpsApi,
} from "@/lib/auth";
import { parseJsonObject } from "@/lib/http";
import {
  deleteSession,
  getSession,
  listSubmissions,
  updateSessionName,
} from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);
  const isAuthenticated = await getOpsSession();

  return NextResponse.json(
    isAuthenticated ? stats : redactStatsForPublicLink(stats),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) return parsed.response;

  const rawName = parsed.data.name;
  if (typeof rawName !== "string") {
    return NextResponse.json({ error: "名稱不得為空" }, { status: 400 });
  }
  const trimmed = rawName.trim();
  if (!trimmed) {
    return NextResponse.json({ error: "名稱不得為空" }, { status: 400 });
  }
  if (trimmed.length > 120 || CONTROL_CHAR_REGEX.test(trimmed)) {
    return NextResponse.json(
      { error: "課程名稱格式不合法（上限 120 字元且不含控制字元）" },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const session = updateSessionName(id, trimmed);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function DELETE(request: Request, context: RouteContext) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const { id } = await context.params;
  const deleted = deleteSession(id);
  if (!deleted) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
