import { buildPublicSummary } from "@/lib/history";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(buildPublicSummary());
}