export type CsvPrimitive = string | number | boolean | null | undefined;

const FORMULA_LEADING_CHARS = new Set(["=", "+", "-", "@", "\t", "\r", "\n"]);
const FORMULA_TRIMMED_CHARS = new Set(["=", "+", "-", "@"]);
const RFC4180_SPECIAL_REGEX = /[,"\r\n]/;

/**
 * 單一 CSV 儲存格安全編碼：
 * 1. 先中和 Excel / Calc 公式注入（前置單引號 `'`）
 * 2. 再依 RFC 4180 處理雙引號倍增與逗號／換行包覆
 */
export function escapeCsvCell(value: CsvPrimitive): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  let text = String(value);
  if (text.length === 0) return "";

  const firstChar = text[0];
  const trimmedFirstChar = text.trimStart()[0];
  if (
    (firstChar && FORMULA_LEADING_CHARS.has(firstChar)) ||
    (trimmedFirstChar && FORMULA_TRIMMED_CHARS.has(trimmedFirstChar))
  ) {
    text = `'${text}`;
  }

  if (RFC4180_SPECIAL_REGEX.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function formatCsvRow(cells: readonly CsvPrimitive[]): string {
  return cells.map(escapeCsvCell).join(",");
}

export function serializeCsvWithBom(rows: readonly string[]): string {
  return `\uFEFF${rows.join("\r\n")}`;
}

/**
 * 嚴格依 RFC 5987 Section 3.2.1 編碼 UTF-8 檔名（含 ' ( ) * 轉義）
 */
export function encodeRfc5987Value(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
  );
}

/**
 * 淨化供作業系統儲存之 UTF-8 檔名主幹（保留中文，過濾非法字元並限制長度 <= 60 code points）
 */
export function sanitizeUtf8FilenameStem(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F/\\?%*:|"<>]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");

  const truncated = Array.from(cleaned)
    .slice(0, 60)
    .join("")
    .replace(/[._]+$/g, "");
  return truncated || fallback;
}

/**
 * 產生保證 100% ByteString 安全（純 ASCII 0x20..0x7E）之 CSV 下載 Headers
 */
export function buildCsvHeaders(
  asciiFallbackFilename: string,
  utf8Filename: string,
): Record<string, string> {
  const safeAscii =
    asciiFallbackFilename
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._]+|[._]+$/g, "") || "export.csv";

  const encodedUtf8 = encodeRfc5987Value(utf8Filename);
  const contentDisposition = `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodedUtf8}`;

  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": contentDisposition,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
}
