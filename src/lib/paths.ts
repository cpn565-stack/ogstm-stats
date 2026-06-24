import { getBasePath } from "./site";

export function withBasePath(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!base) return normalized;
  return `${base}${normalized}`;
}

export const apiPath = withBasePath;
export const appPath = withBasePath;