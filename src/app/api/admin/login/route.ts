import {
  ADMIN_COOKIE,
  adminCookieOptions,
  getAdminToken,
} from "@/lib/auth";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { password?: string };
  const password = body.password ?? "";
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (!expected) {
    return NextResponse.json(
      { error: "伺服器尚未設定 ADMIN_PASSWORD" },
      { status: 500 },
    );
  }

  if (password !== expected) {
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, getAdminToken(), adminCookieOptions());

  return NextResponse.json({ ok: true });
}