import { requireAdminApi } from "@/lib/auth";
import { buildHistoryOverview } from "@/lib/history";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  return NextResponse.json(buildHistoryOverview());
}