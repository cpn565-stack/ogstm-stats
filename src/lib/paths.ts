import { getBasePath } from "./site";

export function withBasePath(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!base) return normalized;
  return `${base}${normalized}`;
}

export const apiPath = withBasePath;
export const appPath = withBasePath;

function isSafeInternalPath(candidate: string): boolean {
  if (!candidate.startsWith("/")) return false;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return false;
  if (/[\u0000-\u001F\u007F]/.test(candidate)) return false;
  try {
    const parsed = new URL(candidate, "http://ogstm.internal");
    return parsed.origin === "http://ogstm.internal";
  } catch {
    return false;
  }
}

/**
 * 淨化登入後導轉之內部相對路徑（不含 basePath，可直接傳給 Next.js redirect() 或 router.push()）：
 * - 阻擋 //evil.com、/\evil.com、https://evil.com、/stats//evil.com 等 Open Redirect
 * - 若傳入路徑已帶 NEXT_PUBLIC_BASE_PATH 前綴，自動剝除一次並二次檢驗安全性
 * - 阻擋導回 /admin/login 或 /ops/login 造成登入頁原地迴圈
 */
export function sanitizeNextPath(
  nextPath: string | null | undefined,
  fallback: string,
): string {
  if (typeof nextPath !== "string") return fallback;
  const trimmed = nextPath.trim();
  if (!isSafeInternalPath(trimmed)) return fallback;

  const base = getBasePath();
  let normalized = trimmed;
  if (base) {
    if (normalized === base) {
      normalized = "/";
    } else if (normalized.startsWith(`${base}/`)) {
      normalized = normalized.slice(base.length);
    }
  }

  if (!isSafeInternalPath(normalized)) return fallback;

  const pathnameOnly = normalized.split("?")[0]?.split("#")[0] ?? "";
  if (pathnameOnly === "/admin/login" || pathnameOnly === "/ops/login") {
    return fallback;
  }

  return normalized;
}
