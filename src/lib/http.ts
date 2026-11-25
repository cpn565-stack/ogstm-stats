import { getSiteUrl } from "./site";
import { NextResponse } from "next/server";

const SAFE_HOST_REGEX = /^(?:[A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::\d{1,5})?$/;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function parseJsonObject(
  request: Request,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "請求內容並非合法的 JSON 格式" },
        { status: 400 },
      ),
    };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "請求內容必須為 JSON 物件" },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: raw as Record<string, unknown> };
}

/**
 * 在 Nginx 反向代理、純 HTTP IP 或本機開發環境下安全推導當前請求之外部 Origin
 */
export function resolveRequestOrigin(request: Request): string {
  const reqUrl = new URL(request.url);

  let proto = reqUrl.protocol.replace(":", "");
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto === "https" || forwardedProto === "http") {
    proto = forwardedProto;
  } else {
    const originHeader = request.headers.get("origin")?.trim().toLowerCase();
    if (originHeader?.startsWith("https://")) proto = "https";
    else if (originHeader?.startsWith("http://")) proto = "http";
  }

  const rawHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    reqUrl.host;

  const safeHost = SAFE_HOST_REGEX.test(rawHost)
    ? rawHost
    : new URL(getSiteUrl()).host;

  return `${proto}://${safeHost}`;
}

/**
 * 驗證狀態變更請求之同源性（CSRF 防護），同時相容純 HTTP IP 存取、HTTPS 反向代理與無 Origin 之 CLI 工具
 */
export function verifySameOrigin(request: Request): NextResponse | null {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return null;
  }

  const secFetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (secFetchSite === "cross-site") {
    return NextResponse.json(
      { error: "跨站請求來源驗證失敗" },
      { status: 403 },
    );
  }

  const originHeader = request.headers.get("origin")?.trim();
  if (!originHeader) {
    return null;
  }
  if (originHeader.toLowerCase() === "null") {
    return NextResponse.json(
      { error: "跨站請求來源驗證失敗" },
      { status: 403 },
    );
  }

  let originHost: string;
  try {
    originHost = new URL(originHeader).host.toLowerCase();
  } catch {
    return NextResponse.json(
      { error: "跨站請求來源驗證失敗" },
      { status: 403 },
    );
  }

  const allowedHosts = new Set<string>();
  try {
    allowedHosts.add(new URL(resolveRequestOrigin(request)).host.toLowerCase());
  } catch {
    // ignore
  }
  try {
    allowedHosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    // ignore
  }
  const xfh = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (xfh && SAFE_HOST_REGEX.test(xfh)) {
    allowedHosts.add(xfh.toLowerCase());
  }
  const hostHeader = request.headers.get("host")?.trim();
  if (hostHeader && SAFE_HOST_REGEX.test(hostHeader)) {
    allowedHosts.add(hostHeader.toLowerCase());
  }
  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSite) {
    try {
      allowedHosts.add(new URL(configuredSite).host.toLowerCase());
    } catch {
      // ignore
    }
  }

  if (!allowedHosts.has(originHost)) {
    return NextResponse.json(
      { error: "跨站請求來源驗證失敗" },
      { status: 403 },
    );
  }

  return null;
}

export function extractClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "local";
}
