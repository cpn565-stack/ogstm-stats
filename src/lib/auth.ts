import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifySameOrigin } from "./http";
import { sanitizeNextPath } from "./paths";
import { getBasePath } from "./site";

export const ADMIN_COOKIE = "ogstm_admin_session";
export const OPS_COOKIE = "ogstm_ops_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 天

export type AuthRole = "admin" | "ops";

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

export function getEffectiveOpsPassword(): string {
  const ops = process.env.OPS_PASSWORD?.trim();
  if (ops) return ops;
  return getAdminPassword();
}

function getSigningSecret(): string {
  const configured = process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) return configured;
  return `ogstm-hmac-fallback:${getAdminPassword()}`;
}

export function signRoleToken(role: AuthRole, password: string): string {
  if (!password) return "";
  return createHmac("sha256", getSigningSecret())
    .update(`v1:${role}:${password}`, "utf8")
    .digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * 以固定長度 HMAC 摘要執行常數時間密碼驗證（不洩漏密碼長度與前綴時序）
 */
export function verifyPasswordConstantTime(
  input: string,
  expected: string,
): boolean {
  if (!input || !expected) return false;
  const secret = getSigningSecret();
  const digestA = createHmac("sha256", secret).update(input, "utf8").digest();
  const digestB = createHmac("sha256", secret).update(expected, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

export function getAdminToken(): string {
  return signRoleToken("admin", getAdminPassword());
}

export function getOpsToken(): string {
  return signRoleToken("ops", getEffectiveOpsPassword());
}

export function isAdminSession(token: string | undefined): boolean {
  const expected = getAdminToken();
  if (!expected || !token) return false;
  return safeEqual(token, expected);
}

export function isOpsTokenValid(token: string | undefined): boolean {
  const expected = getOpsToken();
  if (!expected || !token) return false;
  return safeEqual(token, expected);
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE)?.value);
}

export async function getOpsSession(): Promise<boolean> {
  const cookieStore = await cookies();
  if (isAdminSession(cookieStore.get(ADMIN_COOKIE)?.value)) return true;
  return isOpsTokenValid(cookieStore.get(OPS_COOKIE)?.value);
}

export async function requireAdminPage(): Promise<void> {
  const { redirect } = await import("next/navigation");
  if (!(await getAdminSession())) {
    redirect("/admin/login");
  }
}

export async function requireOpsPage(currentPath = "/ops"): Promise<void> {
  const { redirect } = await import("next/navigation");
  if (!(await getOpsSession())) {
    const safeNext = sanitizeNextPath(currentPath, "/ops");
    if (safeNext === "/ops") {
      redirect("/ops/login");
    }
    redirect(`/ops/login?next=${encodeURIComponent(safeNext)}`);
  }
}

export async function requireAdminApi(
  request?: Request,
): Promise<NextResponse | null> {
  if (await getAdminSession()) {
    if (request) {
      const csrfDenied = verifySameOrigin(request);
      if (csrfDenied) return csrfDenied;
    }
    return null;
  }
  if (await getOpsSession()) {
    return NextResponse.json(
      { error: "權限不足，此操作僅限管理員執行" },
      { status: 403 },
    );
  }
  return NextResponse.json({ error: "需要管理員登入" }, { status: 401 });
}

export async function requireOpsApi(
  request?: Request,
): Promise<NextResponse | null> {
  if (await getOpsSession()) {
    if (request) {
      const csrfDenied = verifySameOrigin(request);
      if (csrfDenied) return csrfDenied;
    }
    return null;
  }
  return NextResponse.json({ error: "需要營運或管理員登入" }, { status: 401 });
}

export function resolveCookieSecure(request?: Request): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;

  if (!request) {
    return process.env.NODE_ENV === "production";
  }

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto === "https") return true;
  if (forwardedProto === "http") return false;

  const origin = request.headers.get("origin")?.trim().toLowerCase();
  if (origin?.startsWith("https://")) return true;
  if (origin?.startsWith("http://")) return false;

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveCookiePath(): string {
  return getBasePath() || "/";
}

export function adminCookieOptions(
  request?: Request,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS,
) {
  return {
    httpOnly: true,
    secure: resolveCookieSecure(request),
    sameSite: "lax" as const,
    path: resolveCookiePath(),
    maxAge: maxAgeSeconds,
  };
}

export const opsCookieOptions = adminCookieOptions;
