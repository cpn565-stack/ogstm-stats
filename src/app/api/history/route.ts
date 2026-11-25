import { requireAdminApi } from "@/lib/auth";
import { buildHistoryOverview } from "@/lib/history";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  return NextResponse.json(buildHistoryOverview(), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
