import { ADMIN_COOKIE, OPS_COOKIE, opsCookieOptions } from "@/lib/auth";
import { resolveRequestOrigin, verifySameOrigin } from "@/lib/http";
import { appPath } from "@/lib/paths";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const csrfDenied = verifySameOrigin(request);
  if (csrfDenied) return csrfDenied;

  const cookieStore = await cookies();
  const expireOpts = opsCookieOptions(request, 0);
  cookieStore.set(OPS_COOKIE, "", expireOpts);
  cookieStore.set(ADMIN_COOKIE, "", expireOpts);
  if (expireOpts.path !== "/") {
    cookieStore.set(OPS_COOKIE, "", { ...expireOpts, path: "/" });
    cookieStore.set(ADMIN_COOKIE, "", { ...expireOpts, path: "/" });
  }

  const target = new URL(appPath("/ops/login"), resolveRequestOrigin(request));
  return NextResponse.redirect(target, { status: 303 });
}
