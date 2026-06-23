import { deleteSubmission, getSubmission } from "@/lib/store";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string; groupId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id, groupId } = await context.params;
  const submission = getSubmission(id, decodeURIComponent(groupId));
  if (!submission) {
    return NextResponse.json({ error: "找不到該組資料" }, { status: 404 });
  }
  return NextResponse.json({ submission });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, groupId } = await context.params;
  const deleted = deleteSubmission(id, decodeURIComponent(groupId));
  if (!deleted) {
    return NextResponse.json({ error: "找不到該組資料" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}