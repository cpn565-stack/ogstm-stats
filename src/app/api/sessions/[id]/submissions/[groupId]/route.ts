import { requireAdminApi, requireOpsApi } from "@/lib/auth";
import { deleteSubmission, getSubmission } from "@/lib/store";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string; groupId: string }>;
}

function safeDecodeParam(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const denied = await requireOpsApi(request);
  if (denied) return denied;

  const { id, groupId } = await context.params;
  const decodedGroupId = safeDecodeParam(groupId);
  if (decodedGroupId === null) {
    return NextResponse.json({ error: "組別參數格式錯誤" }, { status: 400 });
  }

  const submission = getSubmission(id, decodedGroupId);
  if (!submission) {
    return NextResponse.json({ error: "找不到該組資料" }, { status: 404 });
  }
  return NextResponse.json(
    { submission },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const { id, groupId } = await context.params;
  const decodedGroupId = safeDecodeParam(groupId);
  if (decodedGroupId === null) {
    return NextResponse.json({ error: "組別參數格式錯誤" }, { status: 400 });
  }

  const deleted = deleteSubmission(id, decodedGroupId);
  if (!deleted) {
    return NextResponse.json({ error: "找不到該組資料" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
