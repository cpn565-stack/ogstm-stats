import { createSession, listSessions } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ sessions: listSessions() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim() || `課程 ${new Date().toLocaleString("zh-TW")}`;
  const template = getTemplate();
  const session = createSession(name, template.id);
  return NextResponse.json({ session }, { status: 201 });
}