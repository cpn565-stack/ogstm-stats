import { aggregateSubmissions } from "@/lib/aggregate";
import { deleteSession, getSession, listSubmissions, updateSessionName } from "@/lib/store";
import { getTemplate } from "@/lib/template";
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

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);

  return NextResponse.json(stats);
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { name } = (await request.json()) as { name?: string };
  if (!name?.trim()) {
    return NextResponse.json({ error: "名稱不得為空" }, { status: 400 });
  }
  const session = updateSessionName(id, name.trim());
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const deleted = deleteSession(id);
  if (!deleted) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}