import {
  ADMIN_COOKIE,
  adminCookieOptions,
  getAdminPassword,
  getAdminToken,
  verifyPasswordConstantTime,
} from "@/lib/auth";
import {
  extractClientIp,
  parseJsonObject,
  verifySameOrigin,
} from "@/lib/http";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const csrfDenied = verifySameOrigin(request);
  if (csrfDenied) return csrfDenied;

  const rateKey = `admin:${extractClientIp(request)}`;
  const rateStatus = checkLoginRateLimit(rateKey);
  if (!rateStatus.allowed) {
    return NextResponse.json(
      { error: "密碼錯誤次數過多，請 1 分鐘後再試" },
      {
        status: 429,
        headers: { "Retry-After": String(rateStatus.retryAfterSeconds) },
      },
    );
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) return parsed.response;

  const expected = getAdminPassword();
  if (!expected) {
    return NextResponse.json(
      { error: "伺服器尚未設定 ADMIN_PASSWORD" },
      { status: 500 },
    );
  }

  const password =
    typeof parsed.data.password === "string" ? parsed.data.password : "";

  if (!verifyPasswordConstantTime(password, expected)) {
    recordLoginFailure(rateKey);
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }

  resetLoginRateLimit(rateKey);
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, getAdminToken(), adminCookieOptions(request));

  return NextResponse.json({ ok: true });
}
