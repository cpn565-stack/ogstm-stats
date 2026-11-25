# ogstm-stats P0 詳細實作規格書（零猜測施工藍圖）

- **文件編號**：`P0_DETAILED_SPEC_20261125`
- **制定日期**：2026-11-25
- **目標專案**：`/Users/mike/Projects/AI-work/ogstm-stats`（Next.js `16.2.9` App Router + React `19.2.4` + TypeScript `5`）
- **對齊基準文件**：`IMPROVEMENT_PROPOSAL_20261125.md`、`OPTIMIZATION_SPEC_20261125.md`、`docs/SPECIFICATION.md`、`docs/交班單-2026-06-25.md`
- **檢視基準 Commit**：`53ea66a`（`main` 分支）

---

## 第 1 節：範圍、處理順序與不變量保護清單

### 1.1 P0 修復項目總覽與施工相依順序表

本規格書涵蓋三個 P0 必做工程項目（`FIX-01`～`FIX-03`），並同步收斂與 `FIX-02` 直接耦合之 `OPT-05` 子路徑（`NEXT_PUBLIC_BASE_PATH`）、Cookie 安全屬性及重導向防護，確保認證上線後在根網域、子路徑與純 HTTP IP 三種部署拓撲皆能一次到位、零回歸錯誤。

| 項目編號 | 對應建議項 | 優先序與施工順序 | 核心解決問題 | 目標驗收結果 | 核心新增／修改檔案 | 前置相依性 |
| :--- | :---: | :---: | :--- | :--- | :--- | :--- |
| **`FIX-03`** | `OPT-03` | **Step 1**<br>（資料層與渲染基底先行） | 1. 首頁 `/` 缺少 `force-dynamic` 遭 Next.js 建置期靜態凍結舊資料。<br>2. `store.ts` 直接覆寫 `store.json` 非原子操作、無 `.bak` 損毀復原，且 `upsertSubmission` / `deleteSubmission` 重複讀寫磁碟 2 次、404 空刪仍寫檔。<br>3. 分階段（G 卷拍照 → T 卷手動）更新時 `{ ...existing, ...input }` 以 `undefined` 抹除既有 `confidence` / `photoPath`。<br>4. 提交 API 未驗證題號／選項／`0 \| 1` 整數型別，字串 `"1"` 導致 `aggregate.ts` 字串串接污染。 | 1. `/` 與 `/api/public/stats` 每次請求即時計算最新跨場次統計。<br>2. `writeStore` 採同目錄 `.tmp` + `openSync(0o600)` + `writeFileSync` + `fsyncSync` + `closeSync` + `renameSync` 原子替換，損毀時隔離 `.corrupt.<ts>.json` 並自動自 `.bak` 復原。<br>3. 單次提交／刪除僅讀寫磁碟 1 次，且完整保留既有 `id`、`createdAt`、`confidence`、`photoPath`。<br>4. `sanitizeSubmissionVotes()` 嚴格攔截非法題號、未知選項與非 `0 \| 1` 數值並回傳 HTTP `400`。 | `src/lib/http.ts`（新增）<br>`src/lib/store.ts`<br>`src/lib/template.ts`<br>`src/lib/aggregate.ts`<br>`src/app/page.tsx`<br>`src/app/api/public/stats/route.ts`<br>`src/app/api/sessions/[id]/submissions/route.ts` | 無（最優先落地，提供後續 API 共用的 `parseJsonObject` 與穩定 `store.ts`） |
| **`FIX-01`** | `OPT-01` | **Step 2**<br>（獨立匯出編碼模組） | 1. `sessions/route.ts` 預設場次名稱含中文（如 `課程 2026/...`），`export/[id]/route.ts` 將中文直接塞入 `Content-Disposition` Header，觸發 Node `undici` `ByteString TypeError` 100% HTTP `500`。<br>2. 單場與全站 CSV 直接 `.join(",")`，未依 RFC 4180 跳脫逗號／雙引號／換行，亦未防範 `=`、`+`、`-`、`@`、`\t`、`\r` 公式注入。 | 1. 抽出共用 `src/lib/csv.ts`，強制 Header 僅含可列印 ASCII（`0x20..0x7E`）並以 RFC 5987 `filename*=UTF-8''...` 呈現完整中文檔名，徹底消除 `ByteString` 500。<br>2. 輸出含 UTF-8 BOM `\uFEFF` 與 `CRLF` 換行；所有儲存格先執行公式注入單引號 `'` 中和，再執行 RFC 4180 雙引號包覆跳脫。 | `src/lib/csv.ts`（新增）<br>`src/app/api/export/[id]/route.ts`<br>`src/app/api/export/all/route.ts` | `export/[id]` 的認證守門依賴 Step 3 之 `requireOpsApi()`（可先完成 `csv.ts` 純函式，再於 Step 3 掛上認證） |
| **`FIX-02`** | `OPT-02`<br>+ `OPT-05` 認證路由耦合項 | **Step 3**<br>（全站權限閉環與 AI 端點守門） | 1. 公開首頁頁尾直接暴露 `<Link href="/ops">`。<br>2. `DELETE` 刪場次／刪組別、場次列表 `GET /api/sessions`、寫入票數、單場 CSV 匯出、付費 AI 辨識 `/api/recognize*` 均無認證。<br>3. `/api/recognize*` 無 4MB 大小上限與 MIME 白名單。<br>4. `auth.ts` / `AdminLoginForm.tsx` 存在雙重 `basePath`（`/stats/stats/...`）、`next=//evil.com` Open Redirect、登出 `307` POST 重送與純 HTTP IP 下 `Secure` Cookie 失效問題。 | 1. 公開頁完全移除 `/ops` 入口；建立 `public`、`uuid-link`、`ops`、`admin` 四級明確邊界。<br>2. 支援 `OPS_PASSWORD`（未設時自動回退 `ADMIN_PASSWORD`）HMAC-SHA256 Cookie、常數時間比對與登入 IP 限流。<br>3. 講師 `/session/[id]/present` 與 `/session/[id]/live` 維持 100% 免登入且不洩漏各組勾選明細。<br>4. `/api/recognize*` 強制 `ops`/`admin` 認證、原始圖片 `<= 4MB`（Base64 `<= 5,600,000` 字元）與 `jpeg/png/webp` 白名單。 | `src/lib/paths.ts`<br>`src/lib/rate-limit.ts`（新增）<br>`src/lib/auth.ts`<br>`src/lib/recognize-guard.ts`（新增）<br>`src/app/ops/login/page.tsx`（新增）<br>`src/app/api/ops/login/route.ts`（新增）<br>`src/app/api/ops/logout/route.ts`（新增）<br>`src/app/api/admin/login/route.ts`<br>`src/app/api/admin/logout/route.ts`<br>`src/components/AdminLoginForm.tsx`<br>`src/components/PublicStatsHome.tsx`<br>`src/components/OpsHome.tsx`<br>`src/components/ManualInputForm.tsx`<br>`src/app/ops/page.tsx`<br>`src/app/session/[id]/**/page.tsx`<br>`src/app/api/sessions/**/route.ts`<br>`src/app/api/recognize/**/route.ts` | 必須先完成 `src/lib/paths.ts`（同構 `sanitizeNextPath`）與 `src/lib/auth.ts`、`src/lib/http.ts`，再修改 API Routes 與前端元件 |

---

### 1.2 本次必須保留且不得破壞的不變量保護清單（Protected Invariants）

工程師或 AI Agent 施工時，**嚴禁破壞以下既有產品行為與相容性契約**：

1. **講師課堂零登入體驗不變**：
   - `/session/[id]/present`（5 秒輪詢前 5 名口述頁）、`/session/[id]/live`（20 秒輪詢排行＋統計表）與 `GET /api/sessions/[id]` **必須維持憑場次 UUID 免 Cookie 直接開啟與輪詢**，網址結構一字不改，`CopyLiveLinkButton` 複製出的連結在講師無痕視窗或另一台投影筆電上必須立即可用。
2. **`data/store.json` 磁碟 Schema 100% 向下相容**：
   - 嚴禁更改 `data/store.json` 頂層 `{ sessions: Session[], submissions: Submission[] }` 結構與既有欄位名稱；正式機既有歷史資料無須任何遷移腳本即可直接讀取與聚合。
3. **環境變數零停機向下相容**：
   - 若正式機 `.env.production.local` 僅設定既有 `ADMIN_PASSWORD` 而未新增 `OPS_PASSWORD` 或 `COOKIE_SECURE`，系統必須自動將 `OPS_PASSWORD` 回退至 `ADMIN_PASSWORD`、並依請求協定動態推導 Cookie `Secure` 屬性，不得因缺少新環境變數而報錯或鎖死登入。
4. **CSV 既有欄位順序向下相容**：
   - 本階段（P0 `FIX-01`）保留 `export/[id]` 與 `export/all` 既有欄位順序與標題列（新增「選項說明」欄位屬 P2 `OPT-08` 範疇，不在 P0 混入，避免影響既有樞紐分析表欄位索引）。
5. **紙本異常勾選容錯彈性不變**：
   - `sanitizeSubmissionVotes()` 僅驗證每格數值為整數 `0` 或 `1` 及合法題號／選項，**不得**在伺服器端硬性阻擋同一組勾選超過 5 個綠勾／紅勾或同一選項紅綠雙勾（保留課堂真實紙本原貌登錄能力）。
6. **Client / Server Bundler 邊界隔離不變**：
   - 凡是被 `"use client"` 元件（如 `AdminLoginForm.tsx`、`OpsHome.tsx`）匯入之模組（如 `src/lib/paths.ts`、`src/lib/site.ts`），**絕對禁止**匯入 `"next/headers"`、`"fs"` 或 Node 專屬 `"crypto"`，否則將導致 Next.js 16 `npm run build` 編譯失敗。

---

### 1.3 已確認程式碼事實 vs.【待正式機確認】環境前提

| 項目 | 性質 | 具體內容與依據 |
| :--- | :---: | :--- |
| Node `undici` Header `ByteString` 崩潰 | **已確認事實** | `src/app/api/export/[id]/route.ts:64-70` 將含中文字元（字元碼 `> 255`）之 `filename` 寫入 `NextResponse` Header，在 Node 20/22 必拋 `TypeError: Cannot convert argument to a ByteString`。 |
| 雙重 `basePath` 與 Open Redirect | **已確認事實** | `src/lib/auth.ts:29` 呼叫 `redirect(appPath("/admin/login"))`、`src/components/AdminLoginForm.tsx:32` 呼叫 `router.push(appPath(...))`；Next.js 16 的 `redirect()` 與 `router.push()` 已內建附加 `next.config.ts` 之 `basePath`，手動包 `appPath()` 在 `NEXT_PUBLIC_BASE_PATH=/stats` 時必產生 `/stats/stats/...` 404，且 `nextPath?.startsWith("/")` 未攔截 `//evil.com`。 |
| 分階段更新抹除 `confidence` 與 `id` 覆蓋風險 | **已確認事實** | `src/lib/store.ts:121-126` 執行 `{ ...existing, ...input }`，當手動頁傳入 `confidence: undefined` 時會覆蓋拍照頁已寫入之 `existing.confidence`。 |
| `ManualInputForm` 錯誤訊息誤顯綠色 | **已確認事實** | `src/components/ManualInputForm.tsx:180` 僅以 `message.includes("失敗") \|\| message.includes("請輸入")` 判斷紅色樣式，後端回傳 `{ error: "票數格式錯誤..." }` 或 `{ error: "需要營運登入" }` 時會被渲染成成功綠色 `text-emerald-400`。 |
| 講師口述頁無效 UUID 誤導向 `/ops` | **已確認事實** | `src/app/session/[id]/present/page.tsx:14` 寫死 `if (!session) redirect("/ops")`；`/ops` 加認證後會把免登入講師導去 `/ops/login`，應改為同 `live/page.tsx:14-23` 顯示「找不到此場次」提示頁。 |
| 正式機 PM2 執行模式（`fork` vs `cluster`） | **【待正式機確認】** | 交班單載明以 `pm2 restart ogstm-stats` 管理程序；部署前須確認 `pm2 describe ogstm-stats` 之 `exec mode` 為單行程 `fork_mode`（`instances: 1`），避免多行程併發讀寫同一份 `data/store.json` 產生 Lost Update 與跨行程限流計數分散。 |
| 正式機 Nginx `X-Forwarded-Proto` 設定與 HTTP IP 存取 | **【待正式機確認】** | `DEPLOY-FTP.md:103` 範例含 `proxy_set_header X-Forwarded-Proto $scheme;`，但 `README.md:82-87` 範例未寫，且交班單第 `30-37` 行將 `http://165.232.161.37/...` 列為隨時可用入口。故 `resolveCookieSecure()` 必須同時檢查 `COOKIE_SECURE`、`X-Forwarded-Proto`、`Origin` 與 `request.url`，確保 HTTPS 網域與純 HTTP IP 雙邊皆可正常登入。 |

---

## 第 2 節：`FIX-01`（對應 `OPT-01`）單場與全站 CSV 匯出崩潰修復、RFC 5987 檔名與公式注入防禦規格

### 2.1 已確認根因與完整影響路徑

1. **主崩潰路徑（單場次匯出 100% HTTP 500）**：
   - 預設命名源頭：`src/app/api/sessions/route.ts::POST()`（第 `11` 行）建立課程時預設 `name` 為 `` `課程 ${new Date().toLocaleString("zh-TW")}` ``。
   - 崩潰位置：`src/app/api/export/[id]/route.ts::GET()`（第 `64-71` 行）：
     ```ts
     const filename = `${session.name.replace(/[^\w\u4e00-\u9fff-]+/g, "_")}_stats.csv`;
     return new NextResponse(csv, {
       headers: {
         "Content-Type": "text/csv; charset=utf-8",
         "Content-Disposition": `attachment; filename="${filename}"`,
       },
     });
     ```
     正則表達式 `\u4e00-\u9fff` 刻意保留了中文字元，導致 `Headers` 建構時觸發 `undici` WebIDL `ByteString` 轉換例外（字元碼 `> 255`），回傳未捕獲 HTTP `500`。
2. **全量匯出旁路與欄位污染／CSV 公式注入路徑**：
   - `src/app/api/export/[id]/route.ts::GET()`（第 `30-41`、`50-59` 行）與 `src/app/api/export/all/route.ts::GET()`（第 `25-37`、`46-56` 行）均直接以陣列 `.join(",")` 串接 `session.name`、`submission.groupId`、`question.label` 等欄位：
     - 若 `session.name` 為 `"企業策略班 A, B 組"` 或含雙引號 `"`、換行 `\n`，匯出之 CSV 欄位立即錯位。
     - 若 `session.name` 或 `groupId` 以 `=`、`+`、`-`、`@`、`\t`、`\r`、`\n`（或前導空白加公式符號如 `" =1+1"`）開頭，管理員於 Excel / Calc 開啟時具 DDE／公式執行風險。
3. **前端觸發入口盤點（共 4 處，皆透過原生 `<a href={apiPath(...)}>` 導覽下載）**：
   - 助教營運彙整／拍照頁頂欄：`src/components/SessionHeader.tsx`（第 `133` 行）`href={apiPath(\`/api/export/${sessionId}\`)}`
   - 後台場次列表：`src/components/AdminSessionTable.tsx`（第 `53` 行）`href={apiPath(\`/api/export/${item.session.id}\`)}`
   - 後台單場明細頁：`src/app/admin/(protected)/sessions/[id]/page.tsx`（第 `48` 行）`href={apiPath(\`/api/export/${id}\`)}`
   - 後台全量歷史匯出：`src/app/admin/(protected)/page.tsx`（第 `52` 行）`href={apiPath("/api/export/all")}`
   - 由於瀏覽器點擊 `<a href>` 同源導覽會自動攜帶 `SameSite=Lax` HttpOnly Cookie，將 `GET /api/export/[id]` 納入 `requireOpsApi()` 後，上述所有助教與管理員入口皆無須改動前端程式碼即可無縫通過驗證。

---

### 2.2 狀態契約與不變量規則（Invariants & Encoding Matrix）

| 檢查維度 | 輸入情境 | 強制處理契約與輸出不變量 |
| :--- | :--- | :--- |
| **儲存格空值與數值** | `null`、`undefined`、`NaN`、`Infinity` | 回傳空字串 `""`；合法有限 `number` 直接轉為十進位字串（如 `0` -> `"0"`、`0.85` 經 `.toFixed(2)` -> `"0.85"`）。 |
| **公式注入防禦（先執行）** | 字串首字元屬 `=`, `+`, `-`, `@`, `\t`, `\r`, `\n`，**或** `value.trimStart()` 首字元屬 `=`, `+`, `-`, `@` | 於原始字串最前方前置單引號 `'`（即 `'${value}`），再進入下一步 RFC 4180 跳脫。 |
| **RFC 4180 跳脫（後執行）** | 經上一步處理後，字串包含 `,`、`"`、`\r` 或 `\n` | 將內部所有 `"` 替換為 `""`，外層以雙引號 `"..."` 包覆。例如輸入 `=1+1,2` -> 先變 `'=1+1,2` -> 再變 `"'=1+1,2"`。 |
| **BOM 與列分隔符** | 任意列陣列 | 檔案首字元固定前置 UTF-8 BOM `\uFEFF`，列與列之間使用標準 `CRLF`（`\r\n`）連接。 |
| **UTF-8 顯示檔名淨化** | `session.name` 含 `/ \ ? % * : \| " < >`、控制字元、全空白或超長中文（`> 80` 字） | 移除控制字元 `[\u0000-\u001F\u007F]`，將路徑／檔案系統非法字元與連續空白替換為單一 `_`，去除頭尾 `.` 與 `_`，以 `Array.from(stem).slice(0, 60).join("")` 限制最多 `60` 個 Unicode 字元（UTF-8 最多 `180` bytes，加上 `_stats.csv` 遠低於作業系統 `255` bytes 上限）；若淨化後為空字串則回退為 `session_${shortId}`。 |
| **Header ASCII 保證** | 建構 `Content-Disposition` | `filename="..."` 僅允許 `[A-Za-z0-9._-]`；`filename*=UTF-8''...` 使用嚴格 RFC 5987 百分比編碼（除 `encodeURIComponent` 外，額外將 `'`、`(`、`)`、`*` 轉為 `%27`、`%28`、`%29`、`%2A`）。最終所有 Header 值每個字元碼必滿足 `0x20 <= code <= 0x7E`。 |
| **安全快取標頭** | 所有匯出回應 | 強制附帶 `"Cache-Control": "private, no-store"` 與 `"X-Content-Type-Options": "nosniff"`，防止反向代理或共用電腦快取敏感 CSV。 |

---

### 2.3 精確程式碼級修改規格（Code-Level Blueprint）

#### 2.3.1 新增共用模組 `src/lib/csv.ts`

```ts
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

  const truncated = Array.from(cleaned).slice(0, 60).join("").replace(/[._]+$/g, "");
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
```

#### 2.3.2 修改 `src/app/api/export/[id]/route.ts`

- **前置條件**：加入 `requireOpsApi()`（詳見第 3 節 `FIX-02`），未帶 `ops` 或 `admin` Cookie 時回傳 `401`。
- **完整替換規格**：

```ts
import { aggregateSubmissions } from "@/lib/aggregate";
import { requireOpsApi } from "@/lib/auth";
import {
  buildCsvHeaders,
  formatCsvRow,
  sanitizeUtf8FilenameStem,
  serializeCsvWithBom,
} from "@/lib/csv";
import { getSession, listSubmissions } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const denied = await requireOpsApi();
  if (denied) return denied;

  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);

  const rows: string[] = [
    formatCsvRow(["課程", "組別", "題目", "選項", "贊成(綠)", "反對(紅)", "來源", "信心分數"]),
  ];

  for (const submission of stats.submissions) {
    for (const question of template.questions) {
      for (const option of question.options) {
        const counts = submission.votes[question.id]?.[option] ?? {
          green: 0,
          red: 0,
        };
        rows.push(
          formatCsvRow([
            session.name,
            submission.groupId,
            question.label,
            option,
            counts.green,
            counts.red,
            submission.source,
            submission.confidence !== undefined
              ? submission.confidence.toFixed(2)
              : "",
          ]),
        );
      }
    }
  }

  rows.push("");
  rows.push(
    formatCsvRow(["題目", "選項", "贊成(綠)", "反對(紅)", "總計", "贊成率"]),
  );
  for (const question of stats.questions) {
    for (const option of question.options) {
      rows.push(
        formatCsvRow([
          question.label,
          option.option,
          option.green,
          option.red,
          option.total,
          `${option.greenRate}%`,
        ]),
      );
    }
  }

  const csv = serializeCsvWithBom(rows);
  const shortId = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 8) || "session";
  const asciiFilename = `session_${shortId}_stats.csv`;
  const utf8Stem = sanitizeUtf8FilenameStem(session.name, `session_${shortId}`);
  const utf8Filename = `${utf8Stem}_stats.csv`;

  return new NextResponse(csv, {
    headers: buildCsvHeaders(asciiFilename, utf8Filename),
  });
}
```

#### 2.3.3 修改 `src/app/api/export/all/route.ts`

- 維持 `requireAdminApi()`（僅管理員可匯出全站跨場次明細）。
- 將所有列改用 `formatCsvRow`、`serializeCsvWithBom` 與 `buildCsvHeaders("ogstm_history_all.csv", "ogstm_history_all.csv")`，並改用單次快照資料組裝（避免在迴圈內重複讀取磁碟）：

```ts
import { aggregateSubmissions } from "@/lib/aggregate";
import { requireAdminApi } from "@/lib/auth";
import {
  buildCsvHeaders,
  formatCsvRow,
  serializeCsvWithBom,
} from "@/lib/csv";
import { buildHistoryOverview, flattenSubmissionRows } from "@/lib/history";
import { getStoreSnapshot } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import type { Submission } from "@/lib/types";
import { NextResponse } from "next/server";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const snapshot = getStoreSnapshot();
  const template = getTemplate();
  const overview = buildHistoryOverview(snapshot);

  const submissionsBySession = new Map<string, Submission[]>();
  for (const sub of snapshot.submissions) {
    const bucket = submissionsBySession.get(sub.sessionId);
    if (bucket) {
      bucket.push(sub);
    } else {
      submissionsBySession.set(sub.sessionId, [sub]);
    }
  }

  const rows: string[] = [
    formatCsvRow([
      "課程",
      "日期",
      "組別",
      "題目",
      "選項",
      "贊成(綠)",
      "反對(紅)",
      "來源",
      "建立時間",
    ]),
  ];

  for (const item of overview.sessions) {
    const sessionSubs = (submissionsBySession.get(item.session.id) ?? []).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    const stats = aggregateSubmissions(item.session, template, sessionSubs);
    const flatRows = flattenSubmissionRows(stats.submissions, stats);
    for (const row of flatRows) {
      for (const question of row.votesByQuestion) {
        for (const option of question.options) {
          rows.push(
            formatCsvRow([
              item.session.name,
              new Date(item.session.createdAt).toLocaleDateString("zh-TW"),
              row.submission.groupId,
              question.label,
              option.option,
              option.counts.green,
              option.counts.red,
              row.submission.source,
              row.submission.createdAt,
            ]),
          );
        }
      }
    }
  }

  rows.push("");
  rows.push(
    formatCsvRow([
      "題目",
      "選項",
      "歷史贊成(綠)",
      "歷史反對(紅)",
      "歷史總計",
      "贊成率",
      "出現場次數",
    ]),
  );
  for (const row of overview.historicalOptions) {
    rows.push(
      formatCsvRow([
        row.questionLabel,
        row.option,
        row.totalGreen,
        row.totalRed,
        row.totalVotes,
        `${row.greenRate}%`,
        row.sessionCount,
      ]),
    );
  }

  const csv = serializeCsvWithBom(rows);
  return new NextResponse(csv, {
    headers: buildCsvHeaders("ogstm_history_all.csv", "ogstm_history_all.csv"),
  });
}
```
> 註：`buildHistoryOverview(snapshot?: StoreData)` 於 `src/lib/history.ts:54` 新增選填參數 `snapshot = getStoreSnapshot()`，不傳參時行為完全相容，傳入時零額外磁碟 I/O。

---

### 2.4 單項重現與驗收案例表（`FIX-01`）

| 案例編號 | 測試情境 | 輸入資料 | 預期 HTTP／輸出結果 |
| :--- | :--- | :--- | :--- |
| `FIX01-CASE-01` | 預設中文場次名稱單場匯出（重現原 500 Bug） | `session.name = "課程 2026/11/25 下午2:00:00"`，攜帶 `ops` Cookie 呼叫 `GET /api/export/[id]` | 回傳 HTTP `200`（不拋 `ByteString` 例外）；`Content-Disposition` 含 `filename="session_<8碼>_stats.csv"; filename*=UTF-8''%E8%AA%B2%E7%A8%8B_..._stats.csv`；前 3 bytes 為 UTF-8 BOM `EF BB BF`。 |
| `FIX01-CASE-02` | 逗號、雙引號與換行 RFC 4180 跳脫 | `session.name = '企業班 "A, B"\n梯次'` | 儲存格輸出為 `"企業班 ""A, B""\n梯次"`，CSV 解析器還原後欄位數維持固定 8 欄不偏移。 |
| `FIX01-CASE-03` | Excel 公式注入防禦（直接符號開頭） | `groupId` 分別為 `"=1+1"`、`"+SUM(A1)"`、`"-2+3"`、`"@HYPERLINK()"`、`"\t=cmd"` | `escapeCsvCell` 分別輸出 `"'=1+1"`、`"'"+SUM(A1)"`（無逗號時為 `'+SUM(A1)`）、`'-2+3`、`'@HYPERLINK()`、`'\t=cmd`。 |
| `FIX01-CASE-04` | Excel 公式注入防禦（前導空白繞過與複合逗號） | `session.name = '  =CMD|"/C calc"!A0,test'` | 先前置 `'` 再雙引號跳脫，輸出 `"'  =CMD|""/C calc""!A0,test"`。 |
| `FIX01-CASE-05` | RFC 5987 特殊字元（單引號與星號）檔名 | `session.name = "O'Reilly * 2026 (Q4)"` | `filename*` 中 `'`、`(`、`)`、`*` 均被轉義為 `%27`、`%28`、`%29`、`%2A`，Header 全字元碼皆介於 `0x20..0x7E`。 |
| `FIX01-CASE-06` | 極長中文場次名稱與純符號名稱邊界 | ① 100 個中文字名稱；② `session.name = "///"` | ① `utf8Filename` 主幹截斷至 60 字元（總 UTF-8 bytes `< 200`）；② 自動回退至 `session_<8碼>_stats.csv`。 |
| `FIX01-CASE-07` | 未授權存取單場／全站匯出 | 無 Cookie 呼叫 `GET /api/export/[id]` 與 `GET /api/export/all` | 兩者皆回傳 HTTP `401` JSON `{ "error": "..." }`，不回傳任何 CSV 內容。 |
| `FIX01-CASE-08` | 助教 `ops` Cookie 權限邊界 | 僅攜帶 `ogstm_ops_session` 呼叫 `GET /api/export/[id]` vs `GET /api/export/all` | `GET /api/export/[id]` 回傳 `200` CSV；`GET /api/export/all` 回傳 `401`（僅限 `admin`）。 |

---

## 第 3 節：`FIX-02`（對應 `OPT-02` 並整合 `OPT-05` 子路徑／Cookie／重導向安全）分層權限與付費 AI API 防護規格

### 3.1 已確認根因與完整影響路徑

1. **公開頁導覽洩漏**：
   - `src/components/PublicStatsHome.tsx` 第 `2` 行匯入 `Link`，第 `127-133` 行於公開頁尾渲染 `<Link href="/ops">營運入口</Link>`，違反 `docs/SPECIFICATION.md:217`（H-07：助教營運頁不出現在公開導覽）。
2. **無認證暴露之破壞性、列舉、寫入與計費 API**：
   - 場次列舉與建立：`src/app/api/sessions/route.ts`（`GET` 第 `5-7` 行、`POST` 第 `9-15` 行）。攻擊者可先 `GET /api/sessions` 取得全庫所有 UUID。
   - 單場改名與整場刪除：`src/app/api/sessions/[id]/route.ts`（`PATCH` 第 `24-35` 行、`DELETE` 第 `37-44` 行）。
   - 各組明細查詢、覆寫與刪除：`src/app/api/sessions/[id]/submissions/route.ts`（`GET` 第 `9-16` 行、`POST` 第 `18-51` 行）與 `src/app/api/sessions/[id]/submissions/[groupId]/route.ts`（`GET` 第 `8-15` 行、`DELETE` 第 `17-24` 行）。
   - 單場 CSV 匯出：`src/app/api/export/[id]/route.ts`（`GET` 第 `10-72` 行）。
   - 雲端計費 Vision API：`src/app/api/recognize/route.ts`（`POST` 第 `7-63` 行）與 `src/app/api/recognize/openrouter/route.ts`（`POST` 第 `8-60` 行），無認證且未限制圖片大小與 MIME。
3. **子路徑 `basePath`、開放重導向、登出 `307` 與 HTTP Cookie 耦合缺陷**：
   - `src/lib/auth.ts::requireAdminPage()`（第 `29` 行）`redirect(appPath("/admin/login"))` 與 `src/components/AdminLoginForm.tsx`（第 `32` 行）`router.push(appPath(...))` 造成 `NEXT_PUBLIC_BASE_PATH=/stats` 下雙重前綴 `/stats/stats/...` 404。
   - `AdminLoginForm.tsx:32` 未攔截 `next=//evil.com` 或 `next=/\evil.com`（且若在剝除 `/stats` 後未二次檢查，會受 `next=/stats//evil.com` 繞過）。
   - `src/app/api/admin/logout/route.ts::POST()`（第 `10` 行）回傳預設 `307`（使瀏覽器對 `/admin/login` 重送 `POST`）且硬編碼 `getSiteUrl()`（在 `http://165.232.161.37` 操作時強制跳網域）。
   - `src/lib/auth.ts::adminCookieOptions()`（第 `41` 行）寫死 `secure: process.env.NODE_ENV === "production"`，導致依《交班單》1.2 使用 `http://165.232.161.37` 時瀏覽器拒收／拒送 Cookie。
4. **連帶影響圈（Blast Radius）追查發現之 4 個隱藏連鎖問題**：
   - **連鎖問題 A（講師無效連結誤跳營運登入）**：`src/app/session/[id]/present/page.tsx`（第 `14` 行）`if (!session) redirect("/ops")` 會在 `/ops` 受保護後將免登入講師導向 `/ops/login`。必須改為渲染與 `live/page.tsx` 相同的「找不到此場次」無狀態提示頁。
   - **連鎖問題 B（講師免登入端點潛在明細外洩）**：`GET /api/sessions/[id]` 及 `/live`、`/present` SSR 傳入之 `SessionStats.submissions` 目前包含各組完整 `votes` 矩陣，但 `PresenterView` 完全不讀 `submissions`、`LiveStatsView` 內嵌之 `StatsTable`（`src/components/StatsTable.tsx:79-96`）僅讀取 `id`、`groupId`、`source`、`confidence`。對未持 `ops`/`admin` Cookie 的免登入請求，應將回傳之 `submissions` 內每筆 `votes` 脫敏為 `{}`、`photoPath` 設為 `undefined`，兼顧 UI 100% 正常顯示與明細保護。
   - **連鎖問題 C（前端 `401` 白屏與綠字誤報）**：`OpsHome.tsx:15-17` 未檢查 `response.ok` 即 `setSessions(data.sessions)`，遇 `401` 時 `sessions` 變 `undefined` 觸發 `.length` 崩潰；`ManualInputForm.tsx:180` 遇非 `"失敗"` 字眼之錯誤訊息會顯示綠色成功字樣。
   - **連鎖問題 D（管理員在 `/ops` 登出死迴圈）**：若管理員同時持有 `ogstm_admin_session`，在 `/ops` 點擊登出若僅清除 `ogstm_ops_session`，導向 `/ops/login` 時會因 `admin` 自動具備 `ops` 權限而又被彈回 `/ops`。故登出端點必須同時清除兩張 Session Cookie。

---

### 3.2 全站完整路由與 API 權限矩陣表（100% 覆蓋全站每一個路由）

#### 3.2.1 頁面路由（Pages & Layouts，共 11 條路由）

| # | 路由路徑 | 對應原始碼檔案 | 權限等級 | 驗證函式 | 未通過驗證時行為 | 備註與資料邊界 |
| :---: | :--- | :--- | :---: | :--- | :--- | :--- |
| P-01 | `/` | `src/app/page.tsx` | **公開（免登入）** | 無 | 直接渲染 | 強制 `force-dynamic`；移除 `PublicStatsHome` 頁尾 `/ops` 連結。 |
| P-02 | `/session/[id]/present` | `src/app/session/[id]/present/page.tsx` | **講師憑 UUID 免登入** | 選填檢查 `getOpsSession()` 以決定是否脫敏 | 場次不存在時顯示「找不到此場次」提示頁（**嚴禁 `redirect("/ops")`**） | 未登入時 `initialStats.submissions` 脫敏 `votes: {}`。 |
| P-03 | `/session/[id]/live` | `src/app/session/[id]/live/page.tsx` | **講師憑 UUID 免登入** | 選填檢查 `getOpsSession()` 以決定是否脫敏 | 場次不存在時顯示「找不到此場次」提示頁 | 未登入時 `initialStats.submissions` 脫敏 `votes: {}`。 |
| P-04 | `/ops/login` | `src/app/ops/login/page.tsx`（**新增**） | **公開登入頁** | `getOpsSession()` | 已具備 `ops` 或 `admin` 時 `redirect(sanitizeNextPath(next, "/ops"))` | 支援輸入 `OPS_PASSWORD` 或 `ADMIN_PASSWORD`。 |
| P-05 | `/admin/login` | `src/app/admin/login/page.tsx` | **公開登入頁** | `getAdminSession()` | 已具備 `admin` 時 `redirect(sanitizeNextPath(next, "/admin"))` | 僅接受 `ADMIN_PASSWORD`。 |
| P-06 | `/ops` | `src/app/ops/page.tsx` | **助教營運（`ops \| admin`）** | `await requireOpsPage("/ops")` | `redirect("/ops/login")` | 頁首新增「登出營運」POST 表單按鈕。 |
| P-07 | `/session/[id]` | `src/app/session/[id]/page.tsx` | **助教營運（`ops \| admin`）** | `await requireOpsPage(\`/session/${id}\`)` | `redirect(\`/ops/login?next=${encodeURIComponent(\`/session/${id}\`)}\`)` | 場次不存在時導回 `/ops`。 |
| P-08 | `/session/[id]/manual` | `src/app/session/[id]/manual/page.tsx` | **助教營運（`ops \| admin`）** | `await requireOpsPage(\`/session/${id}/manual\`)` | `redirect(\`/ops/login?next=...\`)` | 助教課堂主力手動輸入頁。 |
| P-09 | `/session/[id]/photo` | `src/app/session/[id]/photo/page.tsx` | **助教營運（`ops \| admin`）** | `await requireOpsPage(\`/session/${id}/photo\`)` | `redirect(\`/ops/login?next=...\`)` | 助教課堂 AI 拍照預填頁。 |
| P-10 | `/admin` | `src/app/admin/(protected)/page.tsx` + `layout.tsx` | **僅管理員（`admin`）** | `await requireAdminPage()` | `redirect("/admin/login")`（移除多餘 `appPath()`） | 僅持 `ops` Cookie 者訪問時仍須登入 `admin`。 |
| P-11 | `/admin/sessions/[id]` | `src/app/admin/(protected)/sessions/[id]/page.tsx` + `layout.tsx` | **僅管理員（`admin`）** | `await requireAdminPage()` | `redirect("/admin/login")` | 檢視單場各組完整原始勾選矩陣。 |

#### 3.2.2 API 路由（Route Handlers，共 14 個檔案／18 個 HTTP 方法）

| # | HTTP 方法與路徑 | 對應原始碼檔案 | 權限等級 | 守門函式 | 未授權回應 | 額外輸入／速率／輸出契約 |
| :---: | :--- | :--- | :---: | :--- | :---: | :--- |
| A-01 | `GET /api/public/stats` | `src/app/api/public/stats/route.ts` | **公開（免登入）** | 無 | — | `force-dynamic` + `Cache-Control: no-store`；僅跨場次統計。 |
| A-02 | `GET /api/sessions/[id]` | `src/app/api/sessions/[id]/route.ts` | **講師憑 UUID 免登入** | 內部讀取 `getOpsSession()` | 場次不存在回 `404` | 免登入時將 `submissions[*].votes` 置為 `{}`、`photoPath` 置為 `undefined`；已認證時回傳完整物件；附帶 `Cache-Control: no-store`。 |
| A-03 | `POST /api/ops/login` | `src/app/api/ops/login/route.ts`（**新增**） | **公開（限流保護）** | `checkLoginRateLimit` | 密碼錯 `401`／超限 `429` | 接受 `OPS_PASSWORD`（未設回退 `ADMIN_PASSWORD`）或 `ADMIN_PASSWORD`；成功寫入 `ogstm_ops_session`（7 天）。 |
| A-04 | `POST /api/ops/logout` | `src/app/api/ops/logout/route.ts`（**新增**） | **公開（冪等登出）** | 無 | — | 清除 `ogstm_ops_session` 與 `ogstm_admin_session`，回傳 HTTP `303` 導向 `<origin><basePath>/ops/login`。 |
| A-05 | `POST /api/admin/login` | `src/app/api/admin/login/route.ts` | **公開（限流保護）** | `checkLoginRateLimit` | 密碼錯 `401`／超限 `429` | 僅接受 `ADMIN_PASSWORD`；成功寫入 `ogstm_admin_session`（7 天）。 |
| A-06 | `POST /api/admin/logout` | `src/app/api/admin/logout/route.ts` | **公開（冪等登出）** | 無 | — | 清除 `ogstm_admin_session` 與 `ogstm_ops_session`，回傳 HTTP `303` 導向 `<origin><basePath>/admin/login`。 |
| A-07 | `GET /api/sessions` | `src/app/api/sessions/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()` | `401 { error: "需要營運或管理員登入" }` | 封鎖外部列舉全部場次 UUID。 |
| A-08 | `POST /api/sessions` | `src/app/api/sessions/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()` | `401` | 允許空 JSON body 或 `{ name?: string }`（上限 120 字元）。 |
| A-09 | `PATCH /api/sessions/[id]` | `src/app/api/sessions/[id]/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()` | `401` | `name` 必填非空白字串（上限 120 字元），否則 `400`。 |
| A-10 | `DELETE /api/sessions/[id]` | `src/app/api/sessions/[id]/route.ts` | **僅管理員（`admin`）** | `requireAdminApi()` | `401 { error: "需要管理員權限" }` | 僅持 `ops` Cookie 呼叫亦回傳 `401`（或 `403`，見 3.3 狀態契約）。 |
| A-11 | `GET /api/sessions/[id]/submissions` | `src/app/api/sessions/[id]/submissions/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()` | `401` | 保護單場各組原始明細列表。 |
| A-12 | `POST /api/sessions/[id]/submissions` | `src/app/api/sessions/[id]/submissions/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()` | `401` | 執行 `sanitizeSubmissionVotes()` 嚴格驗證，違規回傳 `400`。 |
| A-13 | `GET /api/sessions/[id]/submissions/[groupId]` | `src/app/api/sessions/[id]/submissions/[groupId]/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()` | `401` | 供查詢單組既有提交紀錄。 |
| A-14 | `DELETE /api/sessions/[id]/submissions/[groupId]` | `src/app/api/sessions/[id]/submissions/[groupId]/route.ts` | **僅管理員（`admin`）** | `requireAdminApi()` | `401` / `403` | 破壞性刪除單組紀錄強制僅管理員可執行。 |
| A-15 | `GET /api/export/[id]` | `src/app/api/export/[id]/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()` | `401` | 套用 `FIX-01` RFC 5987 與公式注入防禦。 |
| A-16 | `POST /api/recognize` | `src/app/api/recognize/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()`（**最先執行**） | `401` | 原始圖 `<= 4MB`（超限 `413`）、MIME 限 `image/jpeg`, `image/png`, `image/webp`（不符 `415`）、合法 `questionId`（不符 `400`）。 |
| A-17 | `POST /api/recognize/openrouter` | `src/app/api/recognize/openrouter/route.ts` | **助教營運（`ops \| admin`）** | `requireOpsApi()`（**最先執行**） | `401` | 與 `/api/recognize` 共用完全相同之驗證守門邏輯，固定路由至 `"openrouter"`。 |
| A-18 | `GET /api/history`、`GET /api/export/all` | `src/app/api/history/route.ts`、`src/app/api/export/all/route.ts` | **僅管理員（`admin`）** | `requireAdminApi()` | `401` / `403` | 團隊後台跨場次總覽與全量 CSV 匯出。 |

---

### 3.3 認證狀態機、Cookie 屬性與輸入防護不變量規則

1. **環境變數與密碼回退規則**：
   - `ADMIN_PASSWORD`：管理員密碼（去頭尾空白後若為空字串，登入 API 回傳 HTTP `500` `{ error: "伺服器尚未設定 ADMIN_PASSWORD" }`，絕不允許空密碼登入）。
   - `OPS_PASSWORD`：選填助教營運密碼；當 `process.env.OPS_PASSWORD?.trim()` 未設定或為空字串時，自動回退使用 `process.env.ADMIN_PASSWORD?.trim()`。
   - `ADMIN_SESSION_SECRET`：HMAC-SHA256 簽章密鑰；若未設定或為空字串，回退至 `ogstm-hmac-fallback:${adminPassword}`（避免舊版固定常數 `"ogstm-stats"` 可離線預測雜湊結構）。
   - `COOKIE_SECURE`：選填 `"true"` 或 `"false"`，留空時自動依請求協定動態判定。
2. **權限區分與 HTTP `401` vs `403` 精確語意**：
   - `requireOpsApi()`：當無任何有效 Cookie 時，回傳 `401 { error: "需要營運或管理員登入" }`。
   - `requireAdminApi()`：
     - 當具備有效 `ogstm_admin_session` 時：通過（回傳 `null`）。
     - 當僅具備有效 `ogstm_ops_session`（助教誤觸管理員 `DELETE` 或 `/api/export/all`）時：回傳 HTTP `403 { error: "權限不足，此操作僅限管理員執行" }`。
     - 當完全未登入時：回傳 HTTP `401 { error: "需要管理員登入" }`。
     > 註：未帶任何 Cookie 呼叫 `DELETE` 等管理員端點仍回傳標準 `401`（符合既有驗收腳本），而助教已登入卻呼叫管理員端點則精確回傳 `403` 免除誤以為未登入的困惑。
3. **`resolveCookieSecure(request)` 四階優先判定表**：
   1. `process.env.COOKIE_SECURE?.trim().toLowerCase()` 為 `"true"` -> `true`；為 `"false"` -> `false`。
   2. `request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()`：為 `"https"` -> `true`；為 `"http"` -> `false`。
   3. `request.headers.get("origin")?.trim().toLowerCase()`：以 `"https://"` 開頭 -> `true`；以 `"http://"` 開頭 -> `false`（即使反向代理漏設 `X-Forwarded-Proto`，瀏覽器於 `POST` 登入請求必帶 `Origin`）。
   4. `new URL(request.url).protocol === "https:"` -> `true`，否則 `false`。
4. **Cookie `path` 子路徑隔離與登出清除保證**：
   - Cookie `path` 統一設為 `getBasePath() || "/"`（根網域部署時為 `"/"`；子路徑部署 `NEXT_PUBLIC_BASE_PATH=/stats` 時為 `"/stats"`，不會外洩至主站其他路徑）。
   - 登出時以 `maxAge: 0` 同時清除 `path: getBasePath() || "/"`（若 `getBasePath()` 非空，額外附加清除一次 `path: "/"` 確保舊版殘留 Cookie 一併失效）。
5. **登入暴力破解限流（`src/lib/rate-limit.ts`）**：
   - 滑動視窗：`WINDOW_MS = 60_000`（60 秒），單一來源 IP 最多允許 `MAX_ATTEMPTS = 5` 次失敗嘗試；第 6 次起在未過期前直接拒絕（不執行密碼雜湊比對），回傳 HTTP `429` 與 Header `Retry-After: <剩餘秒數>` 及 JSON `{ error: "密碼錯誤次數過多，請 1 分鐘後再試" }`。
   - 密碼正確時立即清除該 IP 失敗紀錄；內部 `Map.size > 1000` 時自動掃除過期項目防止記憶體膨脹。
6. **`/api/recognize` 與 `/api/recognize/openrouter` Payload 守門順序**：
   - **順序不可顛倒**：① `requireOpsApi()`（`401`）→ ② `Content-Length > 6_000_000` 快速攔截（`413`）→ ③ 解析 Multipart 或 JSON（格式錯誤回 `400`）→ ④ 驗證 `questionId` 存在於 `getTemplate().questions`（不存在回 `400`）→ ⑤ 驗證 `mimeType` 屬於 `{"image/jpeg", "image/png", "image/webp"}`（不符回 `415`）→ ⑥ 驗證原始圖片大小 `1..4_194_304` bytes（Multipart 先查 `file.size` 再轉 Base64；JSON 剝除可選 `data:...;base64,` 與空白後檢查 Base64 字元合法性、長度 `<= 5_600_000` 且解碼位元組數 `<= 4_194_304`，超限回 `413`、空字串或非法 Base64 回 `400`）→ ⑦ 呼叫 `recognizeQuestionWithLlm`。

---

### 3.4 精確程式碼級修改規格（Code-Level Blueprint）

#### 3.4.1 修改 `src/lib/paths.ts`（同構安全重導向驗證，供 Client 與 Server 共用）

```ts
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
```

#### 3.4.2 新增 `src/lib/http.ts`（安全 JSON 解析與反向代理 Origin 推導）

```ts
import { getSiteUrl } from "./site";
import { NextResponse } from "next/server";

const SAFE_HOST_REGEX = /^(?:[A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\])(?::\d{1,5})?$/;

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
```

#### 3.4.3 新增 `src/lib/rate-limit.ts`（登入暴力破解滑動視窗限流）

```ts
const WINDOW_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 5;
const MAX_TRACKED_KEYS = 1_000;

interface AttemptBucket {
  timestamps: number[];
}

const buckets = new Map<string, AttemptBucket>();

function pruneExpired(now: number) {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets.entries()) {
    const active = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);
    if (active.length === 0) {
      buckets.delete(key);
    } else {
      bucket.timestamps = active;
    }
  }
}

export function checkLoginRateLimit(
  key: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true };

  const active = bucket.timestamps.filter((ts) => now - ts < WINDOW_MS);
  if (active.length === 0) {
    buckets.delete(key);
    return { allowed: true };
  }
  bucket.timestamps = active;

  if (active.length >= MAX_FAILED_ATTEMPTS) {
    const oldest = active[0]!;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

export function recordLoginFailure(key: string, now = Date.now()): void {
  pruneExpired(now);
  const existing = buckets.get(key);
  if (existing) {
    existing.timestamps = existing.timestamps
      .filter((ts) => now - ts < WINDOW_MS)
      .concat(now);
  } else {
    buckets.set(key, { timestamps: [now] });
  }
}

export function resetLoginRateLimit(key: string): void {
  buckets.delete(key);
}

/** 僅供單元測試重置記憶體狀態 */
export function clearAllLoginRateLimitsForTest(): void {
  buckets.clear();
}
```

#### 3.4.4 改寫 `src/lib/auth.ts`（分層 HMAC 簽章、常數時間比對、動態 `Secure` 與頁面／API 守衛）

```ts
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

export async function requireAdminApi(): Promise<NextResponse | null> {
  if (await getAdminSession()) return null;
  if (await getOpsSession()) {
    return NextResponse.json(
      { error: "權限不足，此操作僅限管理員執行" },
      { status: 403 },
    );
  }
  return NextResponse.json({ error: "需要管理員登入" }, { status: 401 });
}

export async function requireOpsApi(): Promise<NextResponse | null> {
  if (await getOpsSession()) return null;
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
```

#### 3.4.5 登入／登出 API 與頁面實作規格

1. **修改 `src/app/api/admin/login/route.ts`**：
   - 使用 `extractClientIp` + `checkLoginRateLimit(\`admin:${ip}\`)`，超限回傳 `429`（附 `Retry-After`）。
   - 使用 `parseJsonObject(request)` 讀取 `{ password }`（非字串視為 `""`）。
   - 若 `!getAdminPassword()` 回傳 `500 { error: "伺服器尚未設定 ADMIN_PASSWORD" }`。
   - 使用 `verifyPasswordConstantTime(password, getAdminPassword())`：失敗時呼叫 `recordLoginFailure(\`admin:${ip}\`)` 並回傳 `401 { error: "密碼錯誤" }`；成功時呼叫 `resetLoginRateLimit(\`admin:${ip}\`)`，設定 `cookieStore.set(ADMIN_COOKIE, getAdminToken(), adminCookieOptions(request))`，回傳 `200 { ok: true }`。
2. **新增 `src/app/api/ops/login/route.ts`**：
   - 限流鍵為 `ops:${ip}`。
   - 若 `!getEffectiveOpsPassword()` 回傳 `500 { error: "伺服器尚未設定營運或管理密碼" }`。
   - 同時以常數時間驗證 `matchesOps = verifyPasswordConstantTime(password, getEffectiveOpsPassword())` 與 `matchesAdmin = verifyPasswordConstantTime(password, getAdminPassword())`（兩者皆執行不短路）。
   - 若 `!matchesOps && !matchesAdmin`：記錄失敗並回傳 `401 { error: "密碼錯誤" }`。
   - 成功時清除限流，設定 `cookieStore.set(OPS_COOKIE, getOpsToken(), opsCookieOptions(request))`，回傳 `200 { ok: true }`。
3. **修改 `src/app/api/admin/logout/route.ts` 與新增 `src/app/api/ops/logout/route.ts`**：
   ```ts
   // src/app/api/admin/logout/route.ts（ops/logout 僅將目標路徑改為 "/ops/login"）
   import {
     ADMIN_COOKIE,
     OPS_COOKIE,
     adminCookieOptions,
   } from "@/lib/auth";
   import { resolveRequestOrigin } from "@/lib/http";
   import { appPath } from "@/lib/paths";
   import { cookies } from "next/headers";
   import { NextResponse } from "next/server";

   export async function POST(request: Request) {
     const cookieStore = await cookies();
     const expireOpts = adminCookieOptions(request, 0);
     cookieStore.set(ADMIN_COOKIE, "", expireOpts);
     cookieStore.set(OPS_COOKIE, "", expireOpts);
     if (expireOpts.path !== "/") {
       cookieStore.set(ADMIN_COOKIE, "", { ...expireOpts, path: "/" });
       cookieStore.set(OPS_COOKIE, "", { ...expireOpts, path: "/" });
     }

     const target = new URL(
       appPath("/admin/login"),
       resolveRequestOrigin(request),
     );
     return NextResponse.redirect(target, { status: 303 });
   }
   ```
4. **修改 `src/components/AdminLoginForm.tsx`、修改 `src/app/admin/login/page.tsx` 與新增 `src/app/ops/login/page.tsx`**：
   - `AdminLoginForm.tsx`：
     - 移除 `appPath` 匯入，改匯入 `apiPath, sanitizeNextPath` 自 `@/lib/paths`，以及 `readJsonResponse` 自 `@/lib/fetch-json`。
     - Props 擴充為 `{ nextPath?: string; mode?: "admin" | "ops" }`（預設 `mode = "admin"`）。
     - 依 `mode` 選擇 `endpoint = apiPath(mode === "ops" ? "/api/ops/login" : "/api/admin/login")` 與 `fallback = mode === "ops" ? "/ops" : "/admin"`。
     - `handleSubmit` 包覆 `try / catch / finally` 確保網路斷線或非 JSON 錯誤皆不會卡死 `loading`，成功後呼叫 `router.push(sanitizeNextPath(nextPath, fallback)); router.refresh();`（**嚴禁外包 `appPath()`**）。
   - `src/app/admin/login/page.tsx`：
     - 先 `const { next } = await searchParams;`，若 `await getAdminSession()` 為真，呼叫 `redirect(sanitizeNextPath(next, "/admin"))`。
   - 新增 `src/app/ops/login/page.tsx`：
     ```tsx
     import { AdminLoginForm } from "@/components/AdminLoginForm";
     import { getOpsSession } from "@/lib/auth";
     import { sanitizeNextPath } from "@/lib/paths";
     import Link from "next/link";
     import { redirect } from "next/navigation";

     interface PageProps {
       searchParams: Promise<{ next?: string }>;
     }

     export default async function OpsLoginPage({ searchParams }: PageProps) {
       const { next } = await searchParams;
       if (await getOpsSession()) {
         redirect(sanitizeNextPath(next, "/ops"));
       }

       return (
         <main className="mx-auto max-w-md space-y-6 py-10">
           <header className="space-y-2 text-center">
             <p className="text-sm font-medium text-emerald-400">課程營運登入</p>
             <h1 className="text-2xl font-bold text-slate-50">OGSTM Stats</h1>
             <p className="text-sm text-slate-400">
               請輸入助教營運密碼以進入課程建立與票數登錄
             </p>
           </header>
           <AdminLoginForm nextPath={next} mode="ops" />
           <p className="text-center text-xs text-slate-500">
             <Link href="/" className="hover:text-slate-300">
               ← 返回公開統計首頁
             </Link>
           </p>
         </main>
       );
     }
     ```

#### 3.4.6 新增 `src/lib/recognize-guard.ts` 並套用至 `/api/recognize` 與 `/api/recognize/openrouter`

```ts
import { getTemplate } from "./template";
import type { LlmProvider } from "./llm-recognize-shared";
import { NextResponse } from "next/server";

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_BASE64_LENGTH = 5_600_000;
export const MAX_REQUEST_CONTENT_LENGTH = 6_000_000;
export const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const STRICT_BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

export interface ValidatedRecognizeInput {
  imageBase64: string;
  mimeType: string;
  questionId: string;
  provider?: string;
}

export function estimateBase64DecodedBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export async function parseAndValidateRecognizeRequest(
  request: Request,
  forcedProvider?: LlmProvider,
): Promise<
  | { ok: true; value: ValidatedRecognizeInput }
  | { ok: false; response: NextResponse }
> {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength) {
    const byteLen = Number(rawContentLength);
    if (Number.isFinite(byteLen) && byteLen > MAX_REQUEST_CONTENT_LENGTH) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  let imageBase64 = "";
  let mimeType = "";
  let questionId = "";
  let provider: string | undefined = forcedProvider;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "表單圖片資料解析失敗" },
          { status: 400 },
        ),
      };
    }

    const file = form.get("image");
    questionId = String(form.get("questionId") ?? "").trim();
    if (!forcedProvider) {
      provider = String(form.get("provider") ?? "").trim() || undefined;
    }

    if (!(file instanceof File)) {
      return {
        ok: false,
        response: NextResponse.json({ error: "請上傳圖片" }, { status: 400 }),
      };
    }
    if (file.size === 0) {
      return {
        ok: false,
        response: NextResponse.json({ error: "圖片檔案為空" }, { status: 400 }),
      };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }

    mimeType = file.type.trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "不支援的圖片格式，僅允許 JPEG、PNG 或 WebP" },
          { status: 415 },
        ),
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    imageBase64 = buffer.toString("base64");
  } else {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "請求內容並非合法的 JSON 格式" },
          { status: 400 },
        ),
      };
    }

    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "請求內容必須為 JSON 物件" },
          { status: 400 },
        ),
      };
    }

    const body = rawBody as Record<string, unknown>;
    questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
    if (!forcedProvider && typeof body.provider === "string") {
      provider = body.provider.trim() || undefined;
    }

    const rawMime =
      body.mimeType === undefined
        ? "image/jpeg"
        : typeof body.mimeType === "string"
          ? body.mimeType.trim().toLowerCase()
          : "";

    let rawB64 = typeof body.imageBase64 === "string" ? body.imageBase64.trim() : "";
    const dataUrlMatch = rawB64.match(/^data:([^;]+);base64,([\s\S]+)$/i);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1]!.trim().toLowerCase();
      rawB64 = dataUrlMatch[2]!;
    } else {
      mimeType = rawMime;
    }

    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "不支援的圖片格式，僅允許 JPEG、PNG 或 WebP" },
          { status: 415 },
        ),
      };
    }

    imageBase64 = rawB64.replace(/\s+/g, "");
    if (!imageBase64) {
      return {
        ok: false,
        response: NextResponse.json({ error: "缺少圖片資料" }, { status: 400 }),
      };
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }
    if (
      imageBase64.length % 4 !== 0 ||
      !STRICT_BASE64_REGEX.test(imageBase64)
    ) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片 Base64 編碼格式不合法" },
          { status: 400 },
        ),
      };
    }
    const decodedBytes = estimateBase64DecodedBytes(imageBase64);
    if (decodedBytes <= 0 || decodedBytes > MAX_IMAGE_BYTES) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "圖片檔案超過 4MB 上限，請壓縮後重試或改用手動輸入" },
          { status: 413 },
        ),
      };
    }
  }

  if (!questionId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "請指定題目" }, { status: 400 }),
    };
  }
  const validQuestion = getTemplate().questions.some((q) => q.id === questionId);
  if (!validQuestion) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "找不到指定的表決題目" },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    value: { imageBase64, mimeType, questionId, provider },
  };
}
```
- `src/app/api/recognize/route.ts` 與 `src/app/api/recognize/openrouter/route.ts`：
  1. 第一行執行 `const denied = await requireOpsApi(); if (denied) return denied;`。
  2. 第二行執行 `const parsed = await parseAndValidateRecognizeRequest(request, /* openrouter 傳 "openrouter" */); if (!parsed.ok) return parsed.response;`。
  3. 呼叫 `recognizeQuestionWithLlm(imageBase64, mimeType, questionId, provider)` 並回傳 JSON。

#### 3.4.7 頁面與前端元件連帶修改細節

1. **`src/components/PublicStatsHome.tsx`**：
   - 刪除第 `2` 行 `import Link from "next/link";`（防止 ESLint `no-unused-vars` 失敗）。
   - 第 `127-133` 行 `<footer>` 改為純說明文字（不含 `/ops` 路徑或連結）：
     ```tsx
     <footer className="border-t border-slate-800 pt-6 text-sm text-slate-500">
       本頁僅呈現跨場次匿名彙整趨勢，不含單場次各組原始明細。
     </footer>
     ```
2. **助教營運頁面加上 `requireOpsPage` 守衛**：
   - `src/app/ops/page.tsx`：改為 `async function OpsPage()`，頂部呼叫 `await requireOpsPage("/ops");`。
   - `src/app/session/[id]/page.tsx`：先 `const { id } = await params; await requireOpsPage(\`/session/${id}\`);`。
   - `src/app/session/[id]/manual/page.tsx`：先 `const { id } = await params; await requireOpsPage(\`/session/${id}/manual\`);`。
   - `src/app/session/[id]/photo/page.tsx`：先 `const { id } = await params; await requireOpsPage(\`/session/${id}/photo\`);`。
3. **講師免登入頁面與單場查詢脫敏（`present/page.tsx`、`live/page.tsx`、`api/sessions/[id]/route.ts`）**：
   - 新增小工具函式 `redactStatsForPublicLink(stats: SessionStats): SessionStats`（可置於 `src/lib/aggregate.ts`）：
     ```ts
     export function redactStatsForPublicLink(stats: SessionStats): SessionStats {
       return {
         ...stats,
         submissions: stats.submissions.map((sub) => ({
           id: sub.id,
           sessionId: sub.sessionId,
           groupId: sub.groupId,
           votes: {},
           source: sub.source,
           ...(sub.confidence !== undefined ? { confidence: sub.confidence } : {}),
           createdAt: sub.createdAt,
           updatedAt: sub.updatedAt,
         })),
       };
     }
     ```
   - `src/app/session/[id]/present/page.tsx`：
     - 新增 `export const dynamic = "force-dynamic";`。
     - 將第 `14` 行 `if (!session) redirect("/ops");` 改為渲染與 `live/page.tsx:15-22` 相同之「找不到此場次」提示區塊（移除未使用之 `redirect` 匯入）。
     - 若 `!(await getOpsSession())`，將傳給 `PresenterView` 的 `initialStats` 經 `redactStatsForPublicLink(stats)` 脫敏。
   - `src/app/session/[id]/live/page.tsx`：
     - 新增 `export const dynamic = "force-dynamic";`。
     - 若 `!(await getOpsSession())`，將傳給 `LiveStatsView` 的 `initialStats` 經 `redactStatsForPublicLink(stats)` 脫敏。
   - `src/app/api/sessions/[id]/route.ts`：
     - `GET`：若 `!(await getOpsSession())` 則回傳 `redactStatsForPublicLink(stats)`，並加上 `{ headers: { "Cache-Control": "no-store" } }`。
     - `PATCH`：呼叫 `requireOpsApi()` + `parseJsonObject(request)`，驗證 `typeof body.name === "string"` 且 `trimmed.length` 介於 `1..120`。
     - `DELETE`：呼叫 `requireAdminApi()`。
4. **`src/app/api/sessions/route.ts` 與 `src/app/api/sessions/[id]/submissions/[groupId]/route.ts`**：
   - `GET /api/sessions`：呼叫 `requireOpsApi()`。
   - `POST /api/sessions`：呼叫 `requireOpsApi()`；若 `request.headers.get("content-length") === "0"` 允許空名稱，否則以 `parseJsonObject` 解析 `{ name }`，若提供 `name` 須為字串且去頭尾空白後 `<= 120` 字元。
   - `GET /api/sessions/[id]/submissions/[groupId]`：呼叫 `requireOpsApi()`。
   - `DELETE /api/sessions/[id]/submissions/[groupId]`：呼叫 `requireAdminApi()`。
5. **`src/components/OpsHome.tsx` 與 `src/components/ManualInputForm.tsx` 防護補強**：
   - `OpsHome.tsx`：
     - 於頁首右側新增 `<form action={apiPath("/api/ops/logout")} method="POST"><button type="submit">登出營運</button></form>`。
     - `loadSessions` 與 `handleCreate` 改用 `readJsonResponse` 並檢查 `response.status === 401`（若過期則 `router.push("/ops/login")`），若其他非 2xx 錯誤則保留 `sessions` 為陣列並顯示錯誤訊息，杜絕 `undefined.length` 白屏。
   - `ManualInputForm.tsx`：
     - 新增 `const [isErrorMessage, setIsErrorMessage] = useState(false);` 狀態取代第 `180` 行脆弱字串比對；`handleSubmit` 改用 `readJsonResponse` + `try/catch/finally`，當 `response.status === 401` 時提示「登入已過期，請重新整理並登入營運頁面」，所有錯誤一律以 `text-rose-400` 呈現。

---

### 3.5 單項重現與驗收案例表（`FIX-02`）

| 案例編號 | 測試情境 | 操作步驟／輸入 | 預期結果 |
| :--- | :--- | :--- | :--- |
| `FIX02-CASE-01` | 公開首頁不暴露營運入口 | 無 Cookie 執行 `GET /` 檢視 HTML | HTTP `200`，HTML 中**不包含** `href="/ops"` 或 `href="/stats/ops"`。 |
| `FIX02-CASE-02` | 未授權阻擋列舉、寫入與刪庫 | 無 Cookie 依序呼叫 `GET /api/sessions`、`POST /api/sessions`、`PATCH /api/sessions/[id]`、`DELETE /api/sessions/[id]`、`GET/POST /api/sessions/[id]/submissions`、`GET/DELETE .../submissions/1` | 全部回傳 HTTP `401` JSON，磁碟 `store.json` 零變更。 |
| `FIX02-CASE-03` | 講師免登入開啟 `/present` 與 `/live` 及脫敏驗證 | 無 Cookie 開啟 `/session/[有效UUID]/present`、`/session/[有效UUID]/live` 並呼叫 `GET /api/sessions/[有效UUID]` | 三者皆回傳 HTTP `200`；排行與統計表、`completedGroups`、各組來源／信心皆正常顯示，且回應 JSON 中 `submissions[*].votes` 為空物件 `{}`。 |
| `FIX02-CASE-04` | 講師開啟已失效 UUID 之 `/present` | 無 Cookie 開啟 `/session/non-existent-id/present` | 直接顯示「找不到此場次」友善畫面，**不會** `307` 導向 `/ops` 或 `/ops/login`。 |
| `FIX02-CASE-05` | 未設 `OPS_PASSWORD` 時平滑回退 | 環境僅設定 `ADMIN_PASSWORD="admin-pass-mock"`，未設 `OPS_PASSWORD`；以 `"admin-pass-mock"` 呼叫 `POST /api/ops/login` | 回傳 `200 { ok: true }` 並簽發 `ogstm_ops_session` Cookie。 |
| `FIX02-CASE-06` | 分離設定 `OPS_PASSWORD` 與 `ADMIN_PASSWORD` 之權限邊界 | 設定 `OPS_PASSWORD="ta-pass-mock"`、`ADMIN_PASSWORD="boss-pass-mock"`；助教登入 `/api/ops/login` 取得 `ogstm_ops_session` | ① 助教可正常建立場次、提交票數、呼叫 `/api/recognize`、下載 `/api/export/[id]`（皆 `200`/`201`）；② 助教呼叫 `DELETE /api/sessions/[id]` 或 `GET /api/export/all` 回傳 `403`；③ 以 `"ta-pass-mock"` 呼叫 `POST /api/admin/login` 回傳 `401`。 |
| `FIX02-CASE-07` | 管理員密碼相容登入營運頁與直接通行 | 管理員持 `ogstm_admin_session` 直接訪問 `/ops`、`/session/[id]/manual` 及各營運 API；或以 `"boss-pass-mock"` 於 `/ops/login` 登入 | 全部直接通過驗證，無須記兩組密碼。 |
| `FIX02-CASE-08` | 子路徑 `NEXT_PUBLIC_BASE_PATH=/stats` 零雙重前綴 | 以 `NEXT_PUBLIC_BASE_PATH=/stats` 建置啟動；未登入訪問 `/stats/session/abc/manual` -> 登入成功導轉 | 未登入導向 `/stats/ops/login?next=%2Fsession%2Fabc%2Fmanual`（無 `/stats/stats`）；登入後正確跳轉 `/stats/session/abc/manual`；Cookie `Path=/stats`。 |
| `FIX02-CASE-09` | Open Redirect 攻擊防禦（含子路徑繞過變形） | `sanitizeNextPath` 測試 `//evil.com`、`/\evil.com`、`https://evil.com`、`/stats//evil.com`、`/ops/login` | 全部安全回退至 `fallback`（`"/ops"` 或 `"/admin"`）。 |
| `FIX02-CASE-10` | 純 HTTP IP vs HTTPS 反向代理動態 `Secure` Cookie | ① Header `Origin: http://165.232.161.37` 登入；② Header `X-Forwarded-Proto: https` 登入 | ① `Set-Cookie` **不含** `Secure`（HTTP IP 可正常保存傳送）；② `Set-Cookie` **包含** `Secure`。 |
| `FIX02-CASE-11` | 登出 `303` 與雙 Cookie 同步清除 | 同時攜帶 `ogstm_admin_session` 與 `ogstm_ops_session` 呼叫 `POST /api/ops/logout` | 回傳 HTTP `303 See Other` 導向 `/ops/login`，且兩張 Cookie 均設 `Max-Age=0` 清除，不會在 `/ops/login` 觸發彈回 `/ops` 死迴圈。 |
| `FIX02-CASE-12` | 登入暴力破解限流 | 同 IP 連續發送 5 次錯誤密碼至 `POST /api/ops/login`，再發第 6 次（即使第 6 次密碼正確） | 前 5 次回 `401`，第 6 次回 `429` 且含 `Retry-After` Header；視窗過期後可恢復正常登入。 |
| `FIX02-CASE-13` | `/api/recognize*` 未授權與超限 > 4MB 攔截 | ① 無 Cookie 傳圖至 `/api/recognize` 與 `/api/recognize/openrouter`；② 持 `ops` Cookie 傳送 4.2MB 圖片（Base64 約 5.87MB） | ① 在解析圖片前即回傳 `401`；② 回傳 HTTP `413` `{ error: "圖片檔案超過 4MB 上限..." }`，絕不觸發上游 Vertex / OpenRouter 計費請求。 |
| `FIX02-CASE-14` | `/api/recognize*` 非法 MIME、壞 Base64 與未知題號 | 持 `ops` Cookie 分別傳送 `mimeType: "application/pdf"`、`mimeType: "image/svg+xml"`、`imageBase64: "not-base64!!!"`、`questionId: "vote_999"` | 非白名單 MIME 回傳 `415`；非法 Base64 與未知 `questionId` 回傳 `400`。 |

---

## 第 4 節：`FIX-03`（對應 `OPT-03`）公開首頁動態渲染、`store.json` 原子寫入與損毀復原、單次寫入合併及 `sanitizeSubmissionVotes()` 驗證規格

### 4.1 已確認根因與完整影響路徑

1. **公開首頁靜態快取凍結**：
   - `src/app/page.tsx::HomePage()`（第 `1-7` 行）與 `src/app/api/public/stats/route.ts::GET()`（第 `1-6` 行）均未宣告 `export const dynamic = "force-dynamic"`，導致 `npm run build` 產生靜態快照後，新課程與新票數無法即時反映於公開首頁 `/`。
2. **`store.ts` 非原子寫入、無損毀復原與雙重 I/O**：
   - `src/lib/store.ts::writeStore()`（第 `29-34` 行）直接對 `data/store.json` 呼叫 `writeFileSync`，程式在寫入中途若遭 `SIGKILL` / `pm2 restart` / 磁碟滿載將留下半截 JSON，隨即導致 `ensureStore()`（第 `26` 行 `JSON.parse`）對全站所有請求拋出 500。
   - `upsertSubmission()`（第 `128-129`, `145-146` 行）與 `deleteSubmission()`（第 `157-160` 行）先呼叫 `writeStore(store)`，緊接著呼叫 `touchSession()` 又重新 `ensureStore()` + `writeStore()`，每次操作重複讀寫 2 次；且 `deleteSubmission` 在找不到目標組別時仍多餘執行 1 次 `writeStore`。
   - `upsertSubmission()`（第 `121-126` 行）更新同組第二階段（如 G 卷拍照後、T 卷改用手動頁送出）時，`{ ...existing, ...input }` 因 `input` 帶有 `{ confidence: undefined, photoPath: undefined }`，直接把第一階段已存入的 `confidence` 覆蓋為 `undefined`（且若 `input.id` 為 `undefined` 甚至會覆蓋 `existing.id`）。
3. **提交 API 無 Schema 驗證與聚合型別污染**：
   - `src/app/api/sessions/[id]/submissions/route.ts::POST()`（第 `25-50` 行）未檢查 `groupId` 型別與長度、未檢查 `source` 列舉、未檢查 `confidence` 範圍，且對 `body.votes` 僅做 `if (!body.votes)` 檢查。一旦寫入字串 `"1"`、負數、`2` 或未知選項，`src/lib/aggregate.ts::aggregateSubmissions()`（第 `22-23` 行 `green += counts.green`）即發生字串串接（如 `"011"`）或百分比破表，污染全站圖表與 CSV。

---

### 4.2 狀態契約與不變量規則（State Matrix & Data Invariants）

#### 4.2.1 `store.json` 讀寫與損毀復原狀態矩陣

| 狀態編號 | 磁碟初始狀態（`store.json` / `store.json.bak`） | 觸發操作 | 強制檔案系統與回傳行為 |
| :---: | :--- | :--- | :--- |
| `S-01` | 主檔不存在、`.bak` 不存在 | `ensureStore()` | 建立 `DATA_DIR`，透過原子寫入初始化 `{ sessions: [], submissions: [] }` 至 `store.json` 並回傳。 |
| `S-02` | 主檔不存在、`.bak` 存在且結構合法 | `ensureStore()` | `console.warn` 記錄告警，將 `.bak` 內容原子寫回 `store.json` 並回傳復原資料。 |
| `S-03` | 主檔存在且結構合法（`sessions` 與 `submissions` 皆為陣列） | `ensureStore()` | 直接回傳解析後 `StoreData`。 |
| `S-04` | 主檔損毀（JSON 語法錯或非合法 `StoreData`）、`.bak` 存在且合法 | `ensureStore()` | ① 先將損毀主檔複製隔離至 `store.corrupt.<timestamp>.json`（保留鑑識證據）；② `console.error` 記錄錯誤；③ 自 `.bak` 原子寫回修復 `store.json` 並回傳復原資料（**絕不以損毀主檔覆蓋 `.bak`**）。 |
| `S-05` | 主檔損毀，且 `.bak` 不存在或亦損毀 | `ensureStore()` | ① 將損毀主檔隔離至 `store.corrupt.<timestamp>.json`；② `console.error` 記錄嚴重告警；③ 原子重建空 `{ sessions: [], submissions: [] }` 使服務自癒不癱瘓。 |
| `S-06` | 正常變更寫入 | `writeStore(data)` | ① 序列化 JSON（尾隨 `\n`）；② 同目錄建立 `.store.<pid>.<ts>.<rand>.tmp`，執行 `openSync(..., "w", 0o600)` -> `writeFileSync` -> `fsyncSync` -> `closeSync`；③ 若既有 `store.json` 存在且可合法解析為 `StoreData`，`copyFileSync(storePath, backupPath)` 更新 `.bak`；④ `renameSync(tmpPath, storePath)` 原子替換（並 best-effort `fsync` 目錄 fd）；若中途失敗必關閉 fd 並 `unlinkSync(tmpPath)`，既有 `store.json` 與 `.bak` 毫髮無傷。 |

#### 4.2.2 `upsertSubmission` 跨階段欄位保留規則

當同一 `(sessionId, groupId)` 已存在紀錄 `existing`，新傳入 `input` 時：
- `id`：**永遠保留** `existing.id`。
- `createdAt`：**永遠保留** `existing.createdAt`；`updatedAt` 更新為當前 ISO 時間 `now`。
- `votes`：`mergeSubmissionVotes(existing.votes, input.votes)`（以 `questionId` 為單位替換本次提交之題目，完整保留另一題既有勾選）。
- `source`：更新為最新一次提交之 `input.source`。
- `confidence`：若 `input.confidence !== undefined` 則採用 `input.confidence`；若 `input.confidence === undefined`（例如第二階段使用手動輸入），**保留 `existing.confidence`**。
- `photoPath`：若 `input.photoPath !== undefined` 則採用 `input.photoPath`；否則**保留 `existing.photoPath`**。
- 同步於同一記憶體 `store` 內更新對應 `session.updatedAt = now`，全流程僅呼叫 `writeStore(store)` **1 次**。

#### 4.2.3 `sanitizeSubmissionVotes(template, rawVotes)` 嚴格驗證矩陣

| 檢驗層級 | 合法條件 | 非法輸入範例 | 回傳結果（觸發 HTTP `400`） |
| :--- | :--- | :--- | :--- |
| 頂層結構 | 非 `null`、非陣列之 Plain Object，且至少有 1 個鍵 | `null`, `[]`, `"votes"`, `{}` | `{ ok: false, error: "缺少有效題目票數資料" }` |
| 題目代號（`questionId`） | 每個鍵皆必須存在於 `template.questions[*].id`，且禁止 `__proto__`/`constructor`/`prototype` | `{ "vote_99": ... }` | `{ ok: false, error: "未知的題目代號：vote_99" }` |
| 單題選項表 | 對應值必須為非 `null`、非陣列之 Plain Object；所有鍵皆必須屬於該題 `question.options` | `vote_2`（僅 `a..j`）傳入選項 `"n"` | `{ ok: false, error: "題目 vote_2 含未知選項：n" }` |
| 單一選項票數 | 未傳入之合法選項自動補 `{ green: 0, red: 0 }`；有傳入之選項值必須為非陣列物件，且 `green` 與 `red` **皆嚴格滿足 `v === 0 \|\| v === 1`**（`-0` 正規化為 `0`） | `{ green: "1", red: 0 }`, `{ green: 2, red: 0 }`, `{ green: -1, red: 0 }`, `{ green: 1 }`, `{ green: true, red: 0 }`, `{ green: NaN, red: 0 }` | `{ ok: false, error: "票數格式錯誤（vote_1.a）：每格僅允許整數 0 或 1" }` |

---

### 4.3 精確程式碼級修改規格（Code-Level Blueprint）

#### 4.3.1 修改 `src/app/page.tsx` 與 `src/app/api/public/stats/route.ts`

```tsx
// src/app/page.tsx
import { PublicStatsHome } from "@/components/PublicStatsHome";
import { buildPublicSummary } from "@/lib/history";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const summary = buildPublicSummary();
  return <PublicStatsHome summary={summary} />;
}
```

```ts
// src/app/api/public/stats/route.ts
import { buildPublicSummary } from "@/lib/history";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildPublicSummary(), {
    headers: { "Cache-Control": "no-store" },
  });
}
```

#### 4.3.2 改寫 `src/lib/store.ts`（支援 `OGSTM_DATA_DIR` 隔離測試、原子寫入、`.bak` 復原、單次寫入與欄位保留）

```ts
import { randomUUID } from "crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { mergeSubmissionVotes } from "./template";
import type { Session, Submission, SubmissionVotes } from "./types";

export interface StoreData {
  sessions: Session[];
  submissions: Submission[];
}

export function resolveStorePaths() {
  const customDir = process.env.OGSTM_DATA_DIR?.trim();
  const dataDir = customDir
    ? path.resolve(customDir)
    : path.join(process.cwd(), "data");
  const storePath = path.join(dataDir, "store.json");
  const backupPath = `${storePath}.bak`;
  return { dataDir, storePath, backupPath };
}

function isValidStoreData(value: unknown): value is StoreData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.sessions) && Array.isArray(candidate.submissions)
  );
}

function tryReadValidStoreFile(filePath: string): StoreData | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isValidStoreData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function atomicWriteJsonFile(
  dataDir: string,
  targetPath: string,
  data: StoreData,
): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const tmpPath = path.join(
    dataDir,
    `.store.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`,
  );

  let fd: number | null = null;
  try {
    fd = openSync(tmpPath, "w", 0o600);
    writeFileSync(fd, payload, "utf-8");
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    renameSync(tmpPath, targetPath);

    try {
      const dirFd = openSync(dataDir, "r");
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch {
      // 忽略部分作業系統或容器掛載點不支援目錄 fsync 之錯誤
    }
  } catch (error) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
    throw error;
  }
}

function writeStore(data: StoreData): void {
  const { dataDir, storePath, backupPath } = resolveStorePaths();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // 僅在既有 store.json 存在且結構合法時更新 .bak，絕不讓損毀檔覆蓋良善備份
  if (tryReadValidStoreFile(storePath) !== null) {
    try {
      copyFileSync(storePath, backupPath);
    } catch {
      // best-effort backup
    }
  }

  atomicWriteJsonFile(dataDir, storePath, data);
}

function ensureStore(): StoreData {
  const { dataDir, storePath, backupPath } = resolveStorePaths();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(storePath)) {
    const fromBackup = tryReadValidStoreFile(backupPath);
    if (fromBackup) {
      console.warn("[store] store.json 不存在，已自動自 store.json.bak 還原");
      atomicWriteJsonFile(dataDir, storePath, fromBackup);
      return fromBackup;
    }
    const initial: StoreData = { sessions: [], submissions: [] };
    atomicWriteJsonFile(dataDir, storePath, initial);
    return initial;
  }

  const primary = tryReadValidStoreFile(storePath);
  if (primary) {
    return primary;
  }

  // 主檔損毀：先隔離證據，再嘗試由 .bak 復原
  const corruptPath = path.join(
    dataDir,
    `store.corrupt.${Date.now()}.${randomUUID().slice(0, 6)}.json`,
  );
  try {
    copyFileSync(storePath, corruptPath);
  } catch {
    // best-effort quarantine
  }

  const recovered = tryReadValidStoreFile(backupPath);
  if (recovered) {
    console.error(
      `[store] 偵測到 store.json 損毀（已隔離至 ${corruptPath}），已自 store.json.bak 自動復原`,
    );
    atomicWriteJsonFile(dataDir, storePath, recovered);
    return recovered;
  }

  console.error(
    `[store] 偵測到 store.json 損毀（已隔離至 ${corruptPath}）且無可用 .bak，已重建空白儲存`,
  );
  const empty: StoreData = { sessions: [], submissions: [] };
  atomicWriteJsonFile(dataDir, storePath, empty);
  return empty;
}

export function getStoreSnapshot(): StoreData {
  return ensureStore();
}

function touchSessionInMemory(
  store: StoreData,
  sessionId: string,
  nowIso: string,
): void {
  const session = store.sessions.find((item) => item.id === sessionId);
  if (session) {
    session.updatedAt = nowIso;
  }
}

export function listSessions(): Session[] {
  const store = ensureStore();
  return [...store.sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getSession(id: string): Session | undefined {
  return ensureStore().sessions.find((session) => session.id === id);
}

export function createSession(name: string, templateId: string): Session {
  const store = ensureStore();
  const now = new Date().toISOString();
  const session: Session = {
    id: randomUUID(),
    name,
    templateId,
    createdAt: now,
    updatedAt: now,
  };
  store.sessions.unshift(session);
  writeStore(store);
  return session;
}

export function updateSessionName(
  id: string,
  name: string,
): Session | undefined {
  const store = ensureStore();
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return undefined;
  session.name = name;
  session.updatedAt = new Date().toISOString();
  writeStore(store);
  return session;
}

export function deleteSession(id: string): boolean {
  const store = ensureStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((session) => session.id !== id);
  if (store.sessions.length === before) {
    return false;
  }
  store.submissions = store.submissions.filter(
    (submission) => submission.sessionId !== id,
  );
  writeStore(store);
  return true;
}

export function listSubmissions(sessionId: string): Submission[] {
  return ensureStore()
    .submissions.filter((submission) => submission.sessionId === sessionId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export function getSubmission(
  sessionId: string,
  groupId: string,
): Submission | undefined {
  return ensureStore().submissions.find(
    (submission) =>
      submission.sessionId === sessionId && submission.groupId === groupId,
  );
}

export function upsertSubmission(
  input: Omit<Submission, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Submission {
  const store = ensureStore();
  const now = new Date().toISOString();
  const existingIndex = store.submissions.findIndex(
    (submission) =>
      submission.sessionId === input.sessionId &&
      submission.groupId === input.groupId,
  );

  if (existingIndex >= 0) {
    const existing = store.submissions[existingIndex]!;
    const mergedVotes: SubmissionVotes = mergeSubmissionVotes(
      existing.votes,
      input.votes,
    );
    const nextConfidence =
      input.confidence !== undefined ? input.confidence : existing.confidence;
    const nextPhotoPath =
      input.photoPath !== undefined ? input.photoPath : existing.photoPath;

    const updated: Submission = {
      id: existing.id,
      sessionId: existing.sessionId,
      groupId: existing.groupId,
      votes: mergedVotes,
      source: input.source,
      ...(nextConfidence !== undefined ? { confidence: nextConfidence } : {}),
      ...(nextPhotoPath !== undefined ? { photoPath: nextPhotoPath } : {}),
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    store.submissions[existingIndex] = updated;
    touchSessionInMemory(store, input.sessionId, now);
    writeStore(store);
    return updated;
  }

  const created: Submission = {
    id: input.id ?? randomUUID(),
    sessionId: input.sessionId,
    groupId: input.groupId,
    votes: input.votes,
    source: input.source,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.photoPath !== undefined ? { photoPath: input.photoPath } : {}),
    createdAt: now,
    updatedAt: now,
  };
  store.submissions.push(created);
  touchSessionInMemory(store, input.sessionId, now);
  writeStore(store);
  return created;
}

export function deleteSubmission(sessionId: string, groupId: string): boolean {
  const store = ensureStore();
  const before = store.submissions.length;
  store.submissions = store.submissions.filter(
    (submission) =>
      !(submission.sessionId === sessionId && submission.groupId === groupId),
  );
  if (store.submissions.length === before) {
    return false;
  }
  touchSessionInMemory(store, sessionId, new Date().toISOString());
  writeStore(store);
  return true;
}
```

#### 4.3.3 修改 `src/lib/template.ts`（新增 `sanitizeSubmissionVotes()`）與 `src/lib/aggregate.ts`

```ts
// 追加於 src/lib/template.ts
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isBinaryVoteInt(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

export type SanitizeVotesResult =
  | { ok: true; votes: SubmissionVotes }
  | { ok: false; error: string };

/**
 * 嚴格驗證並正規化小組提交票數：
 * - 僅允許存在於 template.questions 之題號與該題合法 options
 * - 傳入之每格 green / red 必須為嚴格整數 0 或 1（拒絕字串 "1"、負數、>1、浮點數、布林值）
 * - 未傳入之同題其他選項自動補齊 { green: 0, red: 0 }
 */
export function sanitizeSubmissionVotes(
  template: ThinkingMapTemplate,
  rawVotes: unknown,
): SanitizeVotesResult {
  if (!isPlainRecord(rawVotes)) {
    return { ok: false, error: "缺少有效題目票數資料" };
  }

  const questionEntries = Object.entries(rawVotes);
  if (questionEntries.length === 0) {
    return { ok: false, error: "缺少有效題目票數資料" };
  }

  const questionMap = new Map(
    template.questions.map((question) => [question.id, question]),
  );
  const sanitized: SubmissionVotes = {};

  for (const [questionId, rawOptionMap] of questionEntries) {
    if (FORBIDDEN_OBJECT_KEYS.has(questionId)) {
      return { ok: false, error: "票數資料包含不合法的屬性鍵值" };
    }
    const question = questionMap.get(questionId);
    if (!question) {
      return { ok: false, error: `未知的題目代號：${questionId}` };
    }
    if (!isPlainRecord(rawOptionMap)) {
      return { ok: false, error: `題目 ${questionId} 的選項票數必須為物件` };
    }

    const allowedOptions = new Set(question.options);
    for (const optKey of Object.keys(rawOptionMap)) {
      if (FORBIDDEN_OBJECT_KEYS.has(optKey) || !allowedOptions.has(optKey)) {
        return { ok: false, error: `題目 ${questionId} 含未知選項：${optKey}` };
      }
    }

    const normalizedCounts: VoteCounts = {};
    for (const option of question.options) {
      const entry = rawOptionMap[option];
      if (entry === undefined) {
        normalizedCounts[option] = { green: 0, red: 0 };
        continue;
      }
      if (!isPlainRecord(entry)) {
        return {
          ok: false,
          error: `票數格式錯誤（${questionId}.${option}）：必須為含 green 與 red 之物件`,
        };
      }
      if (!isBinaryVoteInt(entry.green) || !isBinaryVoteInt(entry.red)) {
        return {
          ok: false,
          error: `票數格式錯誤（${questionId}.${option}）：每格僅允許整數 0 或 1`,
        };
      }
      normalizedCounts[option] = {
        green: entry.green === 1 ? 1 : 0,
        red: entry.red === 1 ? 1 : 0,
      };
    }

    sanitized[questionId] = normalizedCounts;
  }

  return { ok: true, votes: sanitized };
}
```

- **同步強化讀取端防禦 `src/lib/aggregate.ts`（第 `19-25` 行）**：
  ```ts
  for (const submission of submissions) {
    const counts = submission.votes?.[question.id]?.[option];
    if (counts) {
      const g = Number(counts.green);
      const r = Number(counts.red);
      if (Number.isFinite(g) && g > 0) green += Math.trunc(g);
      if (Number.isFinite(r) && r > 0) red += Math.trunc(r);
    }
  }
  ```

#### 4.3.4 改寫 `src/app/api/sessions/[id]/submissions/route.ts`

```ts
import { requireOpsApi } from "@/lib/auth";
import { parseJsonObject } from "@/lib/http";
import { getSession, listSubmissions, upsertSubmission } from "@/lib/store";
import { getTemplate, sanitizeSubmissionVotes } from "@/lib/template";
import type { SubmissionSource } from "@/lib/types";
import { NextResponse } from "next/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

export async function GET(_request: Request, context: RouteContext) {
  const denied = await requireOpsApi();
  if (denied) return denied;

  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }
  return NextResponse.json({ submissions: listSubmissions(id) });
}

export async function POST(request: Request, context: RouteContext) {
  const denied = await requireOpsApi();
  if (denied) return denied;

  const { id } = await context.params;
  const session = getSession(id);
  if (!session) {
    return NextResponse.json({ error: "找不到課程" }, { status: 404 });
  }

  const parsed = await parseJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";
  if (!groupId) {
    return NextResponse.json({ error: "請輸入組別" }, { status: 400 });
  }
  if (groupId.length > 32 || CONTROL_CHAR_REGEX.test(groupId)) {
    return NextResponse.json(
      { error: "組別名稱格式不合法（限 1–32 字元且不含控制字元）" },
      { status: 400 },
    );
  }

  const rawSource = body.source ?? "manual";
  if (rawSource !== "manual" && rawSource !== "photo") {
    return NextResponse.json(
      { error: "來源類型錯誤，僅允許 manual 或 photo" },
      { status: 400 },
    );
  }
  const source: SubmissionSource = rawSource;

  let confidence: number | undefined;
  if (body.confidence !== undefined) {
    if (
      typeof body.confidence !== "number" ||
      !Number.isFinite(body.confidence) ||
      body.confidence < 0 ||
      body.confidence > 1
    ) {
      return NextResponse.json(
        { error: "辨識信心分數必須為 0 到 1 之間的數值" },
        { status: 400 },
      );
    }
    confidence = body.confidence;
  }

  let photoPath: string | undefined;
  if (body.photoPath !== undefined) {
    if (
      typeof body.photoPath !== "string" ||
      body.photoPath.length > 256 ||
      CONTROL_CHAR_REGEX.test(body.photoPath)
    ) {
      return NextResponse.json(
        { error: "照片路徑格式不合法" },
        { status: 400 },
      );
    }
    photoPath = body.photoPath;
  }

  const voteCheck = sanitizeSubmissionVotes(getTemplate(), body.votes);
  if (!voteCheck.ok) {
    return NextResponse.json({ error: voteCheck.error }, { status: 400 });
  }

  const submission = upsertSubmission({
    sessionId: id,
    groupId,
    votes: voteCheck.votes,
    source,
    confidence,
    photoPath,
  });

  return NextResponse.json({ submission }, { status: 201 });
}
```

---

### 4.4 單項重現與驗收案例表（`FIX-03`）

| 案例編號 | 測試情境 | 操作步驟／輸入 | 預期結果 |
| :--- | :--- | :--- | :--- |
| `FIX03-CASE-01` | 生產建置後首頁動態即時更新 | `npm run build` 確認路由表 `/` 為 `ƒ (Dynamic)`；啟動 `npm start` 後建立 1 場次並送出 1 組票數，隨即 `GET /` 與 `GET /api/public/stats` | 累計場次數與組別紀錄數立即 +1，無須重新 `build`。 |
| `FIX03-CASE-02` | 原子寫入與 `.bak` 產生驗證 | 在隔離目錄 `OGSTM_DATA_DIR` 建立場次後再新增提交 | 首次寫入建立 `store.json`；第二次更新後自動產生 `store.json.bak`（內容為前一次合法狀態），目錄內無殘留 `.store.*.tmp`。 |
| `FIX03-CASE-03` | `store.json` 截斷損毀自動復原與證據隔離 | 將 `store.json` 故意覆寫為半截字串 `'{"sessions": ['`，呼叫 `listSessions()` | ① 損毀檔被備份為 `store.corrupt.<ts>.json`；② 自動自 `store.json.bak` 還原完整場次與票數，不拋例外；③ `.bak` 本身未被損毀字串污染。 |
| `FIX03-CASE-04` | 主檔與 `.bak` 雙損毀極端情境自癒 | 無 `.bak` 時將 `store.json` 寫入 `"corrupt"`，呼叫 `listSessions()` | 隔離損毀檔後自動初始化空白 `{ sessions: [], submissions: [] }`，回傳 `[]` 而不觸發全站 500 崩潰。 |
| `FIX03-CASE-05` | 跨階段提交保留 `confidence`、`id` 與另一題票數 | 第 3 組先以 `source: "photo", confidence: 0.88` 提交 `vote_1`；再以 `source: "manual"`（`confidence: undefined`）提交 `vote_2` | 回傳之 `Submission` 同時包含 `vote_1` 與 `vote_2` 票數，`id` 與 `createdAt` 不變，且 `confidence` 仍為 `0.88`（未被 `undefined` 抹除），`session.updatedAt` 同步更新。 |
| `FIX03-CASE-06` | `deleteSubmission` / `deleteSession` 404 零多餘寫檔 | 對不存在的 `groupId: "999"` 呼叫 `deleteSubmission` | 回傳 `false`，`store.json` 的 `mtime` 不變（不觸發無謂磁碟寫入）。 |
| `FIX03-CASE-07` | `sanitizeSubmissionVotes` 拒絕字串與越界數值 | 分別傳入 `green: "1"`、`red: -1`、`green: 2`、`red: 0.5`、`green: true`、`{ green: 1 }`（缺 `red`） | 全部回傳 `{ ok: false }`，API 回應 HTTP `400`。 |
| `FIX03-CASE-08` | `sanitizeSubmissionVotes` 拒絕未知題號與跨題選項 | 傳入 `vote_9` 或於 `vote_2`（僅 `a..j`）傳入選項 `k` | 回傳 `{ ok: false }`，API 回應 HTTP `400`。 |
| `FIX03-CASE-09` | `sanitizeSubmissionVotes` 補齊同題未傳選項與 `-0` 正規化 | 提交 `{ vote_2: { a: { green: 1, red: -0 } } }` | 回傳 `{ ok: true }`，`votes.vote_2.a` 為 `{ green: 1, red: 0 }`（`Object.is(red, 0) === true`），且 `b..j` 全部自動補齊為 `{ green: 0, red: 0 }`。 |
| `FIX03-CASE-10` | 非法 JSON Body 與非字串 `groupId` 防崩潰 | 傳送損毀 JSON `"{bad"` 或 `{ "groupId": 12345, "votes": ... }` 至 `POST /api/sessions/[id]/submissions` | 皆回傳 HTTP `400` 明確中文錯誤，不拋 `SyntaxError` 或 `body.groupId.trim is not a function` 500。 |

---

## 第 5 節：逐檔修改總表（File-by-File Execution Checklist）

請嚴格依下列 **Phase A → Phase B → Phase C → Phase D** 順序施工，確保每一步皆可通過 TypeScript 編譯檢查：

| 順序 | 動作 | 檔案路徑（相對專案根目錄） | 對應 FIX | 目標函式／元件 | 關鍵注意事項 |
| :---: | :---: | :--- | :---: | :--- | :--- |
| A-1 | 修改 | `src/lib/paths.ts` | `FIX-02` | `sanitizeNextPath` | **嚴禁**在此檔匯入 `"next/headers"` 或 `"crypto"`，保持 Client / Server 同構。 |
| A-2 | 新增 | `src/lib/http.ts` | `FIX-02`, `FIX-03` | `parseJsonObject`, `resolveRequestOrigin`, `extractClientIp` | `resolveRequestOrigin` 須校驗 `SAFE_HOST_REGEX` 防範 Host Header Injection。 |
| A-3 | 新增 | `src/lib/rate-limit.ts` | `FIX-02` | `checkLoginRateLimit`, `recordLoginFailure`, `resetLoginRateLimit` | 60 秒內最多 5 次失敗；匯出 `clearAllLoginRateLimitsForTest` 供測試使用。 |
| A-4 | 修改 | `src/lib/auth.ts` | `FIX-02` | `signRoleToken`, `verifyPasswordConstantTime`, `getOpsSession`, `requireOpsPage`, `requireOpsApi`, `requireAdminPage`, `requireAdminApi`, `resolveCookieSecure`, `adminCookieOptions` | `requireAdminPage` 改為 `redirect("/admin/login")`（移除 `appPath`）；`requireAdminApi` 對已持 `ops` 者回 `403`、未登入者回 `401`。 |
| A-5 | 修改 | `src/lib/template.ts` | `FIX-03` | `sanitizeSubmissionVotes` | 攔截 `__proto__`/`constructor`/`prototype`、未知題號、未知選項與非 `0 \| 1` 數值。 |
| A-6 | 修改 | `src/lib/store.ts` | `FIX-03` | `resolveStorePaths`, `ensureStore`, `writeStore`, `getStoreSnapshot`, `upsertSubmission`, `deleteSubmission` | 支援 `OGSTM_DATA_DIR`；`openSync` + `writeFileSync` + `fsyncSync` + `closeSync` + `renameSync`；損毀隔離 `.corrupt` 並自 `.bak` 復原；保留既有 `confidence`/`photoPath`/`id`。 |
| A-7 | 修改 | `src/lib/aggregate.ts` | `FIX-02`, `FIX-03` | `aggregateSubmissions`, `redactStatsForPublicLink` | 讀取端 `Number()` 防禦轉型；新增免登入連結 `votes: {}` 脫敏函式。 |
| A-8 | 修改 | `src/lib/history.ts` | `FIX-01`, `FIX-03` | `buildHistoryOverview(snapshot?: StoreData)` | 支援傳入單次快照 `snapshot` 供 `/api/export/all` 共用。 |
| A-9 | 新增 | `src/lib/csv.ts` | `FIX-01` | `escapeCsvCell`, `formatCsvRow`, `serializeCsvWithBom`, `encodeRfc5987Value`, `sanitizeUtf8FilenameStem`, `buildCsvHeaders` | 先前置 `'` 防公式注入，再做 RFC 4180 雙引號跳脫；Header 保證純 ASCII。 |
| A-10 | 新增 | `src/lib/recognize-guard.ts` | `FIX-02` | `parseAndValidateRecognizeRequest` | 統一處理 Multipart 與 JSON 之 4MB 上限、`jpeg/png/webp` 白名單與 Base64／`questionId` 檢核。 |
| B-1 | 修改 | `src/app/api/public/stats/route.ts` | `FIX-03` | `dynamic`, `GET` | 宣告 `export const dynamic = "force-dynamic";` 與 `Cache-Control: no-store`。 |
| B-2 | 修改 | `src/app/api/admin/login/route.ts` | `FIX-02` | `POST` | 套用限流、常數時間密碼比對與 `adminCookieOptions(request)`。 |
| B-3 | 修改 | `src/app/api/admin/logout/route.ts` | `FIX-02` | `POST` | 清除雙 Cookie，以 `resolveRequestOrigin` + HTTP `303` 導回 `/admin/login`。 |
| B-4 | 新增 | `src/app/api/ops/login/route.ts` | `FIX-02` | `POST` | 支援 `OPS_PASSWORD`（回退 `ADMIN_PASSWORD`）或 `ADMIN_PASSWORD`，簽發 `ogstm_ops_session`。 |
| B-5 | 新增 | `src/app/api/ops/logout/route.ts` | `FIX-02` | `POST` | 清除雙 Cookie，以 HTTP `303` 導回 `/ops/login`。 |
| B-6 | 修改 | `src/app/api/sessions/route.ts` | `FIX-02`, `FIX-03` | `GET`, `POST` | 加入 `requireOpsApi()` 與安全 JSON 解析（支援空 body 預設命名）。 |
| B-7 | 修改 | `src/app/api/sessions/[id]/route.ts` | `FIX-02`, `FIX-03` | `GET`, `PATCH`, `DELETE` | `GET` 免登入但未認證時呼叫 `redactStatsForPublicLink`；`PATCH` 加 `requireOpsApi()`；`DELETE` 加 `requireAdminApi()`。 |
| B-8 | 修改 | `src/app/api/sessions/[id]/submissions/route.ts` | `FIX-02`, `FIX-03` | `GET`, `POST` | 加入 `requireOpsApi()`、`parseJsonObject` 與 `sanitizeSubmissionVotes()`。 |
| B-9 | 修改 | `src/app/api/sessions/[id]/submissions/[groupId]/route.ts` | `FIX-02` | `GET`, `DELETE` | `GET` 加 `requireOpsApi()`；`DELETE` 加 `requireAdminApi()`。 |
| B-10 | 修改 | `src/app/api/export/[id]/route.ts` | `FIX-01`, `FIX-02` | `GET` | 加入 `requireOpsApi()` 並套用 `src/lib/csv.ts`。 |
| B-11 | 修改 | `src/app/api/export/all/route.ts` | `FIX-01` | `GET` | 維持 `requireAdminApi()`，套用 `getStoreSnapshot()` 與 `src/lib/csv.ts`。 |
| B-12 | 修改 | `src/app/api/recognize/route.ts`、`src/app/api/recognize/openrouter/route.ts` | `FIX-02` | `POST` | 第一行先執行 `requireOpsApi()`，再呼叫 `parseAndValidateRecognizeRequest`。 |
| C-1 | 修改 | `src/app/page.tsx`、`src/components/PublicStatsHome.tsx` | `FIX-02`, `FIX-03` | `HomePage`, `PublicStatsHome` | `page.tsx` 加 `force-dynamic`；`PublicStatsHome.tsx` 移除 `Link` 匯入與頁尾 `/ops` 連結。 |
| C-2 | 修改 | `src/components/AdminLoginForm.tsx`、`src/app/admin/login/page.tsx` | `FIX-02` | `AdminLoginForm`, `AdminLoginPage` | 支援 `mode?: "admin" \| "ops"`，改用 `sanitizeNextPath` 並移除 `router.push` 外層多餘的 `appPath()`。 |
| C-3 | 新增 | `src/app/ops/login/page.tsx` | `FIX-02` | `OpsLoginPage` | 助教營運登入頁，已登入時導向 `sanitizeNextPath(next, "/ops")`。 |
| C-4 | 修改 | `src/app/ops/page.tsx`、`src/app/session/[id]/page.tsx`、`manual/page.tsx`、`photo/page.tsx` | `FIX-02` | 各營運 Page | 加入 `await requireOpsPage(currentPath)`。 |
| C-5 | 修改 | `src/app/session/[id]/present/page.tsx`、`src/app/session/[id]/live/page.tsx` | `FIX-02`, `FIX-03` | `PresenterPage`, `LiveStatsPage` | 加 `force-dynamic`；`present` 找不到場次時改渲染無狀態提示頁（移除 `redirect("/ops")`）；未認證時脫敏 `initialStats`。 |
| C-6 | 修改 | `src/components/OpsHome.tsx`、`src/components/ManualInputForm.tsx` | `FIX-02`, `FIX-03` | `OpsHome`, `ManualInputForm` | `OpsHome` 補登出表單與 `401` 防崩潰導轉；`ManualInputForm` 修正錯誤訊息色調狀態。 |
| D-1 | 新增 | `scripts/ts-test-loader.mjs`、`src/lib/__tests__/p0-spec.test.ts`、`package.json`（`"test"` 腳本） | `FIX-01`..`03` | 自動化測試 | 零新相依套件，相容 Node 20 與 Node 22，以 `OGSTM_DATA_DIR` 隔離測試磁碟寫入。 |

---

## 第 6 節：隔離環境驗證指令與自動化測試規格

### 6.1 零新增套件、相容 Node 20/22 之測試載入器 `scripts/ts-test-loader.mjs`

由於專案 `src/lib/template.ts` 使用 `@/data/template.json` 路徑別名與無屬性 JSON 匯入，Node 原生 `--experimental-strip-types` 在 Node 20 不支援且在 Node 22 無法解析 `@/*` 別名。請新增以下 `scripts/ts-test-loader.mjs`（直接使用專案已內建之 `typescript` 套件於記憶體內轉譯）：

```js
// scripts/ts-test-loader.mjs
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT_DIR, "src");

function tryResolveFile(basePath) {
  for (const candidate of [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.json`,
    path.join(basePath, "index.ts"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const resolved = tryResolveFile(path.join(SRC_DIR, specifier.slice(2)));
    if (resolved) return { shortCircuit: true, url: pathToFileURL(resolved).href };
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const resolved = tryResolveFile(path.resolve(parentDir, specifier));
    if (resolved) return { shortCircuit: true, url: pathToFileURL(resolved).href };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const raw = readFileSync(fileURLToPath(url), "utf-8");
    return {
      shortCircuit: true,
      format: "module",
      source: `export default ${raw};`,
    };
  }
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const raw = readFileSync(fileURLToPath(url), "utf-8");
    const { outputText } = ts.transpileModule(raw, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    return { shortCircuit: true, format: "module", source: outputText };
  }
  return nextLoad(url, context);
}

// 當透過 --import 載入時自我註冊
if (!process.env.__OGSTM_TS_LOADER_REGISTERED) {
  process.env.__OGSTM_TS_LOADER_REGISTERED = "1";
  register(import.meta.url, pathToFileURL("./"));
}
```

於 `package.json` 的 `"scripts"` 新增：
```json
"test": "node --import ./scripts/ts-test-loader.mjs --test 'src/lib/__tests__/*.test.ts'"
```

---

### 6.2 自動化單元測試規格（`src/lib/__tests__/p0-spec.test.ts`）

測試檔**必須**於 `beforeEach` 建立獨立 `mkdtempSync(path.join(os.tmpdir(), "ogstm-p0-test-"))` 並賦值給 `process.env.OGSTM_DATA_DIR`，於 `afterEach` 執行 `rmSync(tempDir, { recursive: true, force: true })`，確保 **100% 不讀取亦不修改專案根目錄下之 `data/store.json`**：

1. **`FIX-01` 測試群組**：
   - 驗證中文場次名稱經 `buildCsvHeaders` 產出之所有 Header 字元皆滿足 `code >= 0x20 && code <= 0x7E`，且傳入 `new Headers(headers)` 零例外。
   - 驗證 `escapeCsvCell` 對 `=1+1`、`  =1+1`、`+cmd`、`-2`、`@sum`、`\t=x`、`企業班 "A, B"\n梯` 之完整跳脫結果。
   - 驗證 `serializeCsvWithBom` 以 `\uFEFF` 開頭並以 `\r\n` 分隔。
2. **`FIX-02` 測試群組**：
   - 驗證 `sanitizeNextPath` 在 `NEXT_PUBLIC_BASE_PATH=""` 與 `"/stats"` 下對 `//evil.com`、`/\evil.com`、`https://evil.com`、`/stats//evil.com`、`/ops/login`、`/stats/session/123/manual` 之輸出。
   - 驗證 `signRoleToken`、`verifyPasswordConstantTime`、`OPS_PASSWORD` 未設回退 `ADMIN_PASSWORD`、`resolveCookieSecure` 四階判定、以及 `checkLoginRateLimit` 第 6 次鎖定 `429` 與 `resetLoginRateLimit`。
   - 驗證 `parseAndValidateRecognizeRequest` 對 `> 4MB`（`413`）、`application/pdf`（`415`）、損毀 Base64（`400`）、未知 `questionId`（`400`）及合法 JPEG（`200` `ok: true`）之行為。
3. **`FIX-03` 測試群組**：
   - 驗證 `createSession` + `upsertSubmission` 產生 `.bak`、無殘留 `.tmp`；模擬截斷 `store.json` 後自動隔離 `.corrupt.*.json` 並自 `.bak` 無損還原。
   - 驗證第 1 階段 `photo`（`confidence: 0.91`）+ 第 2 階段 `manual`（`confidence: undefined`）後，`confidence` 仍為 `0.91` 且 `vote_1`、`vote_2` 並存。
   - 驗證 `sanitizeSubmissionVotes` 拒絕字串 `"1"`、`-1`、`2`、未知題號、跨題選項，並正確正規化合法輸入。

---

### 6.3 本機隔離整合驗證 CLI 指令（不碰觸正式 `data/store.json`）

工程師完成實作後，於專案根目錄依序執行以下指令，全部必須以 Exit Code `0` 通過：

```bash
# 1. 單元測試（自動隔離於 os.tmpdir()）
npm test

# 2. TypeScript 嚴格型別與 ESLint 檢查
npx tsc --noEmit
npm run lint

# 3. 正式環境建置檢查（驗證路由表 `/` 為 `ƒ (Dynamic)`，非 `○ (Static)`）
npm run build

# 4. 子路徑模式建置相容檢查
NEXT_PUBLIC_BASE_PATH=/stats npm run build

# 5. 本機隔離啟動端到端冒煙驗證（使用 /tmp 獨立目錄與合成密碼，絕不碰觸 data/store.json）
ISO_DIR="$(mktemp -d /tmp/ogstm-smoke-XXXXXX)"
PORT=3456 \
OGSTM_DATA_DIR="$ISO_DIR" \
ADMIN_PASSWORD="smoke-admin-pass-mock" \
OPS_PASSWORD="smoke-ops-pass-mock" \
ADMIN_SESSION_SECRET="smoke-secret-32-chars-minimum-mock" \
npm run start &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; rm -rf "$ISO_DIR"' EXIT
sleep 3

# 5a. 公開首頁不含 /ops 連結
! curl -fsS http://127.0.0.1:3456/ | grep -q 'href="/ops"'

# 5b. 未登入呼叫敏感 API 均回 401
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3456/api/sessions)" = "401"
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3456/api/recognize -H 'Content-Type: application/json' -d '{}')" = "401"

# 5c. 助教登入 -> 建立預設中文名稱場次 -> 匯出單場 CSV（驗證 200 非 500）-> 講師無 Cookie 輪詢統計（驗證 200 且 votes 脫敏）
COOKIE_JAR="$ISO_DIR/ops.cookies"
curl -fsS -c "$COOKIE_JAR" -X POST http://127.0.0.1:3456/api/ops/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"smoke-ops-pass-mock"}'

SESSION_ID="$(curl -fsS -b "$COOKIE_JAR" -X POST http://127.0.0.1:3456/api/sessions \
  -H 'Content-Type: application/json' -d '{}' | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).session.id))')"

test "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' "http://127.0.0.1:3456/api/export/$SESSION_ID")" = "200"
test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3456/api/sessions/$SESSION_ID")" = "200"
test "$(curl -s -b "$COOKIE_JAR" -o /dev/null -w '%{http_code}' -X DELETE "http://127.0.0.1:3456/api/sessions/$SESSION_ID")" = "403"
```

---

## 第 7 節：部署順序、正式機 Gate 與安全回滾規範

### 7.1 部署前正式機環境檢查清單（Pre-Deploy Gate）

1. **【待正式機確認】檢查 PM2 執行模式**：
   - 於 VPS 執行 `sudo -u deploy pm2 describe ogstm-stats | grep -E "exec mode|instances"`，確認為 `fork_mode` 且 `instances` 為 `1`（單檔 JSON 儲存架構嚴禁開啟多行程 `cluster` 模式）。
2. **【待正式機確認】檢查 Nginx 反向代理標頭**：
   - 檢查 `/etc/nginx/sites-available/ogstm-stats` 是否包含 `proxy_set_header X-Forwarded-Proto $scheme;`、`proxy_set_header X-Real-IP $remote_addr;` 與 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`（影響限流來源 IP 精準度；若缺漏應補上並執行 `sudo nginx -t && sudo systemctl reload nginx`）。
3. **環境變數檢核（`/home/deploy/ogstm-stats/.env.production.local`）**：
   - 確認 `ADMIN_PASSWORD` 與至少 32 字元隨機值之 `ADMIN_SESSION_SECRET` 已設定。
   - 若團隊希望區分「助教課堂密碼」與「團隊後台刪除／全量匯出密碼」，新增一行 `OPS_PASSWORD=<REDACTED>`；若暫不區分則無須新增（自動共用 `ADMIN_PASSWORD`）。
4. **原子同批更新要求**：
   - 第 5 節所列所有檔案**必須於同一個 Git Commit / Release 原子部署**，不可只更新 API 而不更新前端登入頁 `/ops/login`，否則助教將無登入介面取得 `ogstm_ops_session`。
   - 部署完成後，因簽章演算法由單純 SHA-256 升級為帶角色域隔離之 HMAC-SHA256，原瀏覽器舊版 `ogstm_admin_session` 將自然失效，團隊與助教重新登入一次即可。

---

### 7.2 PM2 / VPS 標準部署與上線後 Gate 驗證步驟

```bash
# 1. 於正式機強制建立部署前手動快照備份並驗證 JSON 合法性
ssh root@165.232.161.37 'sudo -u deploy bash -lc "
  set -euo pipefail
  mkdir -p /home/deploy/ogstm-backups
  BACKUP_FILE=/home/deploy/ogstm-backups/store-pre-p0-\$(date +%F-%H%M%S).json
  cp /home/deploy/ogstm-stats/data/store.json \"\$BACKUP_FILE\"
  node -e \"JSON.parse(require(\\\"fs\\\").readFileSync(\\\"\$BACKUP_FILE\\\", \\\"utf8\\\"))\"
  echo \"Backup verified: \$BACKUP_FILE\"
"'

# 2. 拉取更新、安裝相依、建置確認 BUILD_ID 後重啟 PM2
ssh root@165.232.161.37 'sudo -u deploy bash -lc "
  set -euo pipefail
  cd /home/deploy/ogstm-stats
  git fetch origin
  git checkout main
  git reset --hard origin/main
  npm ci
  npm test
  npm run build
  test -f .next/BUILD_ID
  pm2 restart ogstm-stats --update-env
"'

# 3. 上線後 30 秒內必跑 Gate 檢查
# Gate-1: 公開首頁 HTTP 200 且已隱藏 /ops 連結
! curl -fsS https://ogstm.spq.tw/ | grep -q 'href="/ops"'
# Gate-2: 未授權場次列表與辨識端點皆已被攔截為 401
test "$(curl -s -o /dev/null -w '%{http_code}' https://ogstm.spq.tw/api/sessions)" = "401"
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST https://ogstm.spq.tw/api/recognize -H 'Content-Type: application/json' -d '{}')" = "401"
# Gate-3: 助教營運登入頁可正常開啟
test "$(curl -s -o /dev/null -w '%{http_code}' https://ogstm.spq.tw/ops/login)" = "200"
```

---

### 7.3 Docker 容器化部署注意事項

若改採 `Dockerfile` 容器部署：
1. `/app/data` **必須掛載持久化 Host Volume**（例如 `-v /home/deploy/ogstm-data:/app/data`），使 `writeStore` 的同目錄 `.tmp` -> `renameSync` 與 `.bak` 均位於同一持久化檔案系統掛載點內。
2. 執行期機密環境變數（`ADMIN_PASSWORD`、`OPS_PASSWORD`、`ADMIN_SESSION_SECRET`、`OPENROUTER_API_KEY`、`GOOGLE_APPLICATION_CREDENTIALS`）一律於 `docker run --env-file` 注入，**嚴禁**寫入 `Dockerfile` `ARG`/`ENV`。
3. 建置期變數 `NEXT_PUBLIC_BASE_PATH`、`NEXT_PUBLIC_SITE_URL`、`NEXT_PUBLIC_MAIN_SITE_URL`、`NEXT_PUBLIC_LLM_PROVIDER` 若有變更，必須於 `docker build --build-arg` 重新建置映像檔。

---

### 7.4 零資料損失安全回滾規範（Rollback SOP）

由於本次 P0 升級 **100% 保留 `data/store.json` 既有 JSON 結構**，即使新版本上線後已寫入新場次或新組別票數，回退至基準 Commit `53ea66a` 亦**完全不會遺失課堂期間新增的合法資料**：

1. **僅回滾應用程式碼（保留課堂最新 `data/store.json`，耗時 < 45 秒）**：
   ```bash
   ssh root@165.232.161.37 'sudo -u deploy bash -lc "
     set -euo pipefail
     cd /home/deploy/ogstm-stats
     git checkout 53ea66a
     npm ci
     npm run build
     pm2 restart ogstm-stats --update-env
   "'
   ```
2. **連同資料檔一併還原至部署前快照（僅在確認磁碟資料需回溯時執行）**：
   ```bash
   ssh root@165.232.161.37 'sudo -u deploy bash -lc "
     set -euo pipefail
     cd /home/deploy/ogstm-stats
     cp data/store.json /home/deploy/ogstm-backups/store-before-rollback-\$(date +%F-%H%M%S).json
     LATEST_PRE_P0=\$(ls -1t /home/deploy/ogstm-backups/store-pre-p0-*.json | head -n 1)
     cp \"\$LATEST_PRE_P0\" data/store.json.rollback.tmp
     mv -f data/store.json.rollback.tmp data/store.json
   "'
   ```
   > 注意：還原 `store.json` 時同樣使用同目錄 `.rollback.tmp` + `mv -f` 原子替換，無須停機即可立即生效。
