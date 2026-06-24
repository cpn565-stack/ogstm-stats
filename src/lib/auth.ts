import { createHash } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "ogstm_admin_session";

export function getAdminToken(): string {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SESSION_SECRET ?? "ogstm-stats";
  if (!password) return "";
  return createHash("sha256").update(`${password}:${secret}`).digest("hex");
}

export function isAdminSession(token: string | undefined): boolean {
  const expected = getAdminToken();
  if (!expected || !token) return false;
  return token === expected;
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);
}

export async function requireAdminPage(): Promise<void> {
  const { redirect } = await import("next/navigation");
  const { appPath } = await import("./paths");
  if (!(await getAdminSession())) {
    redirect(appPath("/admin/login"));
  }
}

export async function requireAdminApi(): Promise<NextResponse | null> {
  if (await getAdminSession()) return null;
  return NextResponse.json({ error: "需要登入" }, { status: 401 });
}

export function adminCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}