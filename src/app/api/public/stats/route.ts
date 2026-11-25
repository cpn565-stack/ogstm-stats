import { buildPublicSummary } from "@/lib/history";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildPublicSummary(), {
    headers: { "Cache-Control": "no-store" },
  });
}
