# ogstm-stats 優化改善技術規格書

- **文件日期**：2026-11-25
- **關聯建議書**：`IMPROVEMENT_PROPOSAL_20261125.md`
- **目標專案**：`ogstm-stats`（Next.js 16 App Router + TypeScript）

---

## 1. 規格範疇與目標

### 1.1 涵蓋項目
本規格書定義 `IMPROVEMENT_PROPOSAL_20261125.md` 所列全部項目之具體落地方案：
- **P0 必做項目**：`OPT-01`（CSV 匯出崩潰修復與跳脫）、`OPT-02`（營運／刪除／AI 端點權限隔離）、`OPT-03`（公開首頁動態渲染、`store.json` 原子寫入與提交 Schema 驗證）。
- **P1 核心改善**：`OPT-04`（課堂防誤覆蓋與 T 卷題本語意對齊）、`OPT-05`（`basePath` 路由、Open Redirect、登出 `303` 與認證強化）、`OPT-06`（LLM 逾時、非 JSON 錯誤防護與 `responseSchema`）、`OPT-07`（即時輪詢斷網韌性與前端安全解析）。
- **P2 維運與品質**：`OPT-08`（`O(1)` 單次讀檔快照與選項中文說明）、`OPT-09`（`.dockerignore`、`deploy.sh` 原子建置切換與 `next/font`）、`OPT-10`（`node:test` 單元測試）。

### 1.2 核心目標
1. 消除所有已知執行期 500 崩潰（中文場次 CSV 匯出、上游非 JSON 回應、JSON 儲存截斷）。
2. 在**不影響講師免登入開啟 `/session/[id]/live` 與 `/session/[id]/present`** 的前提下，封堵未授權刪庫、竄改票數、列舉場次與盜刷 AI 額度風險。
3. 杜絕課堂助教連續輸入時因組別殘留或未載入舊紀錄造成的誤覆蓋，並使全站 G/T 卷綠紅標籤與實體講義 100% 一致。

### 1.3 非目標（Non-goals）
- 不變更 `data/store.json` 既有檔案位置與基本 JSON 欄位，不引入外部資料庫或 Redis。
- 不變更講師端分享網址格式（`/session/[id]/live` 與 `/session/[id]/present`）。
- 不強制阻擋助教儲存非「5 綠 + 5 紅」之特殊組別紙本紀錄。

---

## 2. 模組化技術規格

### 2.1 認證、權限分級與路由安全規格（對應 `OPT-02`、`OPT-05`）

#### 2.1.1 環境變數與角色分級
於 `.env.example` 與執行環境支援以下設定（向下相容既有設定）：
```env
ADMIN_PASSWORD=<REDACTED>           # 必填：後台管理密碼（可兼作營運密碼）
OPS_PASSWORD=<REDACTED>             # 選填：助教營運密碼；未設定時自動回退使用 ADMIN_PASSWORD
ADMIN_SESSION_SECRET=<REDACTED>     # 建議必填：HMAC 簽章密鑰（至少 32 字元）
COOKIE_SECURE=                      # 選填：true | false；留空時依請求協定 (HTTPS / X-Forwarded-Proto) 自動判斷
```

定義兩張 HttpOnly Cookie：
- `ogstm_admin_session`：管理員身分（同時具備 `admin` 與 `ops` 權限）。
- `ogstm_ops_session`：助教營運身分（具備 `ops` 權限；若管理員已登入則自動通過 `ops` 驗證，無須二次登入）。

#### 2.1.2 端點與頁面權限矩陣

| 路由／API | 所需權限 | 說明 |
| :--- | :---: | :--- |
| `GET /`、`GET /api/public/stats` | 公開 | 僅跨場次加總，移除頁尾 `/ops` 連結 |
| `GET /session/[id]/live`、`GET /session/[id]/present` | 免登入（憑 UUID） | 保留講師課堂一鍵開啟體驗 |
| `GET /api/sessions/[id]` | 免登入（憑 UUID） | 供 `/live` 與 `/present` 輪詢單場彙整統計 |
| `/ops`、`/session/[id]`、`/session/[id]/manual`、`/session/[id]/photo` | `ops` 或 `admin` | 未認證時導向 `/ops/login?next=...` |
| `GET/POST /api/sessions`、`PATCH /api/sessions/[id]` | `ops` 或 `admin` | 保護場次列表（防止列舉 UUID）與建立／改名 |
| `GET/POST /api/sessions/[id]/submissions`、`GET /api/sessions/[id]/submissions/[groupId]` | `ops` 或 `admin` | 保護各組票數讀寫 |
| `GET /api/export/[id]`、`POST /api/recognize`、`POST /api/recognize/openrouter` | `ops` 或 `admin` | 保護單場各組 CSV 與付費 AI Vision 呼叫 |
| `/admin/*`、`GET /api/history`、`GET /api/export/all` | 僅 `admin` | 團隊管理後台與跨場次完整明細匯出 |
| `DELETE /api/sessions/[id]`、`DELETE /api/sessions/[id]/submissions/[groupId]` | 僅 `admin` | 破壞性刪除強制僅管理員可呼叫 |

#### 2.1.3 簽章、常數時間比對、限流與安全重導向（`src/lib/auth.ts`）
1. **HMAC Token 計算與常數時間驗證**：
   ```ts
   import { createHmac, timingSafeEqual } from "crypto";

   function getSigningSecret(): string {
     const secret = process.env.ADMIN_SESSION_SECRET?.trim();
     if (secret) return secret;
     const fallback = process.env.ADMIN_PASSWORD?.trim() ?? "";
     return `ogstm-fallback:${fallback}`;
   }

   export function signRoleToken(role: "admin" | "ops", password: string): string {
     if (!password) return "";
     return createHmac("sha256", getSigningSecret())
       .update(`${role}:${password}`)
       .digest("hex");
   }

   export function safeEqual(a: string, b: string): boolean {
     if (!a || !b) return false;
     const bufA = Buffer.from(a, "utf-8");
     const bufB = Buffer.from(b, "utf-8");
     if (bufA.length !== bufB.length) return false;
     return timingSafeEqual(bufA, bufB);
   }
   ```
2. **Cookie `secure` 動態判定**：
   - 新增 `resolveCookieSecure(request: Request): boolean`：
     - 若 `process.env.COOKIE_SECURE === "true"` 回傳 `true`；若為 `"false"` 回傳 `false`。
     - 否則檢查 `request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https"` 或 `new URL(request.url).protocol === "https:"`。
3. **登入暴力破解限流（記憶體滑動視窗）**：
   - 新增 `src/lib/rate-limit.ts`：以 `x-forwarded-for` 首個 IP 或 `x-real-ip` 為鍵，限制單一 IP 於 `60 秒` 內最多 `5 次` 密碼錯誤（超過回傳 HTTP `429` `{ error: "嘗試次數過多，請 1 分鐘後再試" }`），成功登入時清除該 IP 失敗計數，並於 Map 超過 1,000 筆時清理過期紀錄。
4. **修復雙重 `basePath`、Open Redirect 與登出 `303`**：
   - 新增 `sanitizeNextPath(nextPath: string | undefined, fallback: string): string`：僅當 `typeof nextPath === "string" && nextPath.startsWith("/") && !nextPath.startsWith("//") && !nextPath.startsWith("/\\")` 時回傳 `nextPath`（若意外帶入 `basePath` 前綴則先剝除一次避免重複），否則回傳 `fallback`。
   - `requireAdminPage()` 改呼叫 `redirect("/admin/login")`（移除 `appPath()`）。
   - `AdminLoginForm.tsx` 改呼叫 `router.push(sanitizeNextPath(nextPath, "/admin"))`（移除 `appPath()`）。
   - `POST /api/admin/logout`（及營運登出）改回傳：
     ```ts
     return NextResponse.redirect(new URL(appPath("/admin/login"), request.url), { status: 303 });
     ```

---

### 2.2 儲存層原子化、單次快照與提交驗證規格（對應 `OPT-03`、`OPT-08`）

#### 2.2.1 `store.json` 原子寫入與單次快照（`src/lib/store.ts`）
1. **原子寫入流程 `writeStore(data: StoreData)`**：
   - 確保 `DATA_DIR` 存在。
   - 若 `STORE_PATH` 已存在，先 `copyFileSync(STORE_PATH, `${STORE_PATH}.bak`)`（忽略不存在錯誤）。
   - 將序列化後 JSON 寫入同目錄暫存檔 `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`（確保與目標檔位於同一檔案系統 mount point）。
   - 呼叫 `renameSync(tmpPath, STORE_PATH)` 完成 POSIX 原子替換。
2. **損毀防護 `readStoreSnapshot(): StoreData`**：
   - 若 `STORE_PATH` 不存在則初始化 `{ sessions: [], submissions: [] }`。
   - `JSON.parse` 包覆 `try/catch`：若主檔解析失敗且 `${STORE_PATH}.bak` 存在且可解析，記錄 `console.error` 並回退載入 `.bak`（同時將損毀檔備份為 `store.corrupt.<timestamp>.json` 供排錯，絕不靜默丟棄）。
   - 匯出唯讀快照函式 `getStoreSnapshot(): StoreData`，供 `buildHistoryOverview()` 與 `/api/export/all` 單次讀檔完成全量聚合，將讀檔次數由 `3N + 1` 降至 `1` 次。
3. **消除重複寫入與欄位誤抹除**：
   - 移除 `upsertSubmission` 與 `deleteSubmission` 結尾額外讀寫磁碟的 `touchSession()` 呼叫，改於同一個 `store` 物件內直接更新對應 `session.updatedAt = now`，最後僅呼叫一次 `writeStore(store)`。
   - `upsertSubmission` 更新既有組別時，僅在 `input.confidence !== undefined` 時更新 `confidence`，僅在 `input.photoPath !== undefined` 時更新 `photoPath`，避免第二階段手動輸入把第一階段拍照記錄的信心值改為 `undefined`。

#### 2.2.2 提交資料伺服器端驗證（`src/lib/template.ts` + `submissions/route.ts`）
新增純函式 `validateAndNormalizeVotes(template: ThinkingMapTemplate, rawVotes: unknown): SubmissionVotes | null`：
- `rawVotes` 必須為非陣列之 Plain Object，且至少包含一個存在於 `template.questions` 的 `questionId`。
- 對每個傳入之合法 `questionId`，依該題 `question.options` 建立完整選項表：
  - 若傳入選項之 `green` / `red` 存在，必須為有限整數且 `>= 0` 且 `<= 1`（若有任一欄位為字串如 `"1"`、`NaN`、負數或大於 1 之異常值，回傳 `null` 觸發 HTTP `400` `{ error: "票數格式錯誤，每格僅允許 0 或 1" }`）。
  - 未傳入之選項補 `{ green: 0, red: 0 }`；忽略不在模板內的未知鍵值。
- 驗證 `groupId`：去頭尾空白後長度 `1..32`，禁止控制字元。
- 驗證 `source`：僅允許 `"manual" | "photo"`。
- 驗證 `confidence`：若提供，必須為 `0..1` 之間的有限數值。

#### 2.2.3 公開首頁動態渲染（`src/app/page.tsx`）
於 `src/app/page.tsx` 頂部明確宣告：
```ts
export const dynamic = "force-dynamic";
```

---

### 2.3 CSV 安全編碼與中文檔名規格（對應 `OPT-01`、`OPT-08`）

新增 `src/lib/csv.ts`：
1. **`escapeCsvCell(value: string | number | null | undefined): string`**：
   - `null` 或 `undefined` 回傳 `""`；`number` 轉為字串。
   - 若字串去左側空白後首字元為 `=`、`+`、`-`、`@`、`\t`、`\r`（且非純負數格式），前置單引號 `'` 中和公式執行。
   - 若字串含 `,`、`"`、`\n`、`\r`，將內部 `"` 替換為 `""` 並以雙引號 `"..."` 包覆。
2. **`buildCsvHeaders(asciiFallbackName: string, utf8Filename: string): HeadersInit`**：
   - `asciiFallbackName` 僅保留 `[A-Za-z0-9._-]`（例如 `session_${session.id.slice(0, 8)}_stats.csv`）。
   - `utf8Filename` 移除路徑分隔符與控制字元後以 `encodeURIComponent` 編碼：
     ```ts
     return {
       "Content-Type": "text/csv; charset=utf-8",
       "Content-Disposition": `attachment; filename="${asciiFallbackName}"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`,
     };
     ```
3. **CSV 欄位擴充**：於單場與全量匯出新增 `選項說明` 欄（對應 `question.optionLabels?.[option] ?? ""`），並依各題 `greenLabel` / `redLabel` 呈現精確語意。

---

### 2.4 模板語意對齊與課堂防誤覆蓋規格（對應 `OPT-04`）

#### 2.4.1 模板結構擴充（`src/lib/types.ts`、`src/data/template.json`）
於 `VoteQuestion` 介面新增選填欄位：
```ts
export interface VoteQuestion {
  id: string;
  label: string;
  shortLabel?: string;
  section?: string;
  referenceImage?: string;
  greenLabel?: string; // 預設 "最重要"
  redLabel?: string;   // vote_1: "最易忽略", vote_2: "最不易執行"
  maxGreen?: number;   // 預設 5（僅供 UI 提示，不硬性阻擋）
  maxRed?: number;     // 預設 5（僅供 UI 提示，不硬性阻擋）
  options: string[];
  optionLabels?: Record<string, string>;
}
```
- `template.json` 中：
  - `vote_1`（G 卷）：`"greenLabel": "最重要"`, `"redLabel": "最易忽略"`, `"maxGreen": 5`, `"maxRed": 5`。
  - `vote_2`（T 卷）：`"greenLabel": "最重要"`, `"redLabel": "最不易執行"`, `"maxGreen": 5`, `"maxRed": 5`。
- 同步更新 `VoteCounter`、`ManualInputForm`、`PhotoInputForm`、`PresenterView`、`LiveStatsView`、`StatsTable`、`PublicStatsHome` 與 `buildPublicSummary` 的文案，使其動態顯示各題專屬之綠／紅標籤。

#### 2.4.2 組別既有資料自動載入與儲存清空流程（`ManualInputForm.tsx`、`PhotoInputForm.tsx`）
1. **儲存成功後防誤覆蓋**：
   - 儲存成功後呼叫 `setGroupId("")`，清空目前組別，將上一組成功訊息保留於狀態列（如 `✓ 已儲存 G · 第 3 組，請輸入下一組組別`），防止助教忘記改組別直接覆寫。
2. **既有組別偵測與預載**：
   - 當 `groupId.trim()` 非空時，以 `300ms` debounce 呼叫 `GET /api/sessions/${sessionId}/submissions/${encodeURIComponent(groupId.trim())}`（搭配 `AbortController` 取消過時查詢）：
     - 若回傳 `200` 且 `submission.votes[questionId]` 存在：
       - 於 `ManualInputForm`：若使用者尚未手動修改當前空白表單，自動帶入該組既有勾選，並顯示琥珀色提示橫幅：「第 X 組已有紀錄，已載入既有勾選；儲存將覆寫更新」。
       - 於 `PhotoInputForm`：若目前已由照片辨識預填則保留照片辨識結果，但仍顯示醒目警告：「注意：第 X 組已有紀錄，儲存將覆寫該組此題資料」；若尚未拍照則載入既有勾選方便人工微調。
     - 若回傳 `404`：清除「已有紀錄」狀態標籤。
3. **即時勾選計數與衝突提示**：
   - 分別計算當前題目 `greenCount`、`redCount` 與 `conflictOptions`（同時勾綠與紅之選項代號）。
   - 於置頂列顯示 `綠 {greenCount}/5`、`紅 {redCount}/5`；若 `greenCount > 5`、`redCount > 5` 或 `conflictOptions.length > 0`，顯示琥珀色提醒文字（如 `提醒：選項 c 同時勾選綠與紅，請確認紙本`），不鎖定儲存按鈕。

---

### 2.5 AI 拍照辨識韌性與輪詢穩定規格（對應 `OPT-06`、`OPT-07`）

#### 2.5.1 伺服器端 LLM 呼叫強化（`vertex-recognize.ts`、`openrouter-recognize.ts`、`vertex-auth.ts`、`api/recognize*`）
1. **Payload 驗證（`api/recognize/route.ts` 與 `openrouter/route.ts`）**：
   - `ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"])`。
   - `MAX_BASE64_LENGTH = 5_600_000`（約 4MB 原始圖片）；超過回傳 HTTP `413` `{ error: "圖片檔案過大，請壓縮後重試或改用手動輸入" }`。
2. **上游逾時與安全解析**：
   - `fetch` 加入 `signal: AbortSignal.timeout(25_000)`。
   - 先讀取 `const rawBody = await response.text()`，再以 `try/catch` 解析 JSON；若逾時（`TimeoutError` / `AbortError`）回傳「AI 辨識逾時，請重試、切換模型或直接手動勾選」；若為非 JSON（如 HTML 502/504）回傳 `AI 服務暫時無法連線 (${response.status})，請改選另一模型或手動勾選`，徹底消除英文 `SyntaxError` 外洩。
3. **Vertex `responseSchema` 與 OAuth 自動重載**：
   - `vertex-recognize.ts` 的 `generationConfig` 補上 `responseSchema`，明確定義 `votes`（依 `question.options` 動態生成 `{ green: INTEGER, red: INTEGER }` 屬性）、`confidence`（`NUMBER`）、`notes`（`STRING`）。
   - `vertex-auth.ts`：於 `getVertexAccessToken()` 捕獲例外時執行 `cachedAuth = null`（確保磁碟更新 `adc.json` 後無須重啟 PM2 即可生效）；若錯誤訊息含 `invalid_grant` 或 `reauth`，拋出中文訊息：「Vertex AI OAuth 憑證已過期，請通知管理員更新憑證，課堂請先改選 Nemotron VL 或手動輸入」。

#### 2.5.2 前端取消辨識與輪詢韌性
1. **`PhotoInputForm.tsx`**：
   - 新增 `abortControllerRef = useRef<AbortController | null>(null)`，辨識期間提供「取消 AI 辨識（直接手動勾選）」按鈕；元件 unmount 時中止進行中請求並呼叫 `URL.revokeObjectURL(previewUrlRef.current)`。
2. **`PresenterView.tsx` 與 `LiveStatsView.tsx`**：
   - `refresh()` 包覆 `try/catch`，傳入 `{ cache: "no-store" }` 並改用 `readJsonResponse<SessionStats>(response)`；新增 `offline: boolean` 狀態，失敗時不中斷計時器並於頁首顯示柔和琥珀色標籤「網路連線不穩，重試中…」。
   - 監聽 `document.visibilitychange`：背景分頁時略過 `refresh()`，切回前景時立即觸發一次 `refresh()`。

---

### 2.6 容器化、部署與字體內嵌規格（對應 `OPT-09`、`OPT-10`）

1. **`.dockerignore`**：排除 `node_modules`、`.next`、`out`、`build`、`deploy`、`.git`、`.env*`、`!.env.example`、`.gcp`、`data/*.json`、`*.log`。
2. **`Dockerfile`**：
   - `builder` 階段補齊 `ARG NEXT_PUBLIC_MAIN_SITE_URL=https://ogstm.com` 與 `ARG NEXT_PUBLIC_LLM_PROVIDER=vertex`。
   - `runner` 階段移除 `COPY --from=builder /app/data ./data`，僅保留 `RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data` 並宣告 `VOLUME ["/app/data"]`。
3. **`scripts/deploy.sh`**：
   - 備份完成後自動清理舊備份：`ls -1t "${BACKUP_DIR}"/store-deploy-*.json 2>/dev/null | tail -n +31 | xargs -r rm -f --`（保留最新 30 份）。
   - 確認 `npm run build` 成功且 `.next/BUILD_ID` 存在後才執行 `pm2 restart`。
4. **自託管字體（`src/app/layout.tsx` & `src/app/globals.css`）**：
   - 於 `layout.tsx` 使用 `next/font/google` 載入 `Fira_Sans`（weights `400, 500, 600, 700`）與 `Fira_Code`（weights `400, 600, 700`），注入 CSS 變數 `--font-fira-sans`、`--font-fira-code`；移除 `globals.css:1` 的外部 Google Fonts `@import`。
5. **單元測試（`OPT-10`）**：
   - 於 `package.json` 新增 `"test": "node --experimental-strip-types --test 'src/lib/__tests__/*.test.ts'"`（Node 22 原生支援；若於 Node 20 執行可透過內建 `tsc` 轉譯至暫存目錄或輕量開發相依），測試涵蓋 `csv.ts`、`presenter.ts`、`store.ts`（含暫存目錄 `OGSTM_DATA_DIR` 環境變數注入以便隔離測試，不碰正式 `data/store.json`）與 `llm-recognize-shared.ts`。

---

## 3. 逐檔修改清單（File-by-File Change Plan）

| 動作 | 檔案路徑（相對專案根目錄） | 目標函式／區塊 | 修改重點 |
| :---: | :--- | :--- | :--- |
| 新增 | `src/lib/csv.ts` | `escapeCsvCell`, `buildCsvHeaders` | 實作 RFC 4180 逗號／雙引號／換行跳脫、公式字元 `'` 中和，以及 RFC 5987 `filename*` Header 產生器 |
| 新增 | `src/lib/rate-limit.ts` | `checkLoginRateLimit`, `resetLoginRateLimit` | 實作單機記憶體 IP 滑動視窗限流（60s / 5 次失敗） |
| 新增 | `src/app/ops/login/page.tsx` | `OpsLoginPage` | 助教營運登入頁（共用登入表單元件，支援 `OPS_PASSWORD` 或 `ADMIN_PASSWORD`） |
| 新增 | `src/app/api/ops/login/route.ts` | `POST` | 驗證營運／管理員密碼、套用限流並簽發 `ogstm_ops_session` Cookie |
| 新增 | `src/app/api/ops/logout/route.ts` | `POST` | 清除 `ogstm_ops_session` 並以 `303` 導回 `/ops/login` |
| 新增 | `.dockerignore` | 全檔 | 排除 `node_modules`、`.next`、`.env*`、`.gcp`、`data/*.json` 等機密與建置產物 |
| 新增 | `src/lib/__tests__/core.test.ts` | 單元測試套件 | 測試 CSV 跳脫與 Header、並列排名、票數驗證、原子寫入與 LLM JSON 正規化 |
| 修改 | `src/lib/auth.ts` | `signRoleToken`, `requireAdminPage`, `requireOpsPage`, `requireOpsApi`, `sanitizeNextPath`, `adminCookieOptions` | 改用 HMAC + `timingSafeEqual`；新增 `ops` 權限檢查；修正 `redirect("/admin/login")` 雙重 `basePath`；動態判斷 `secure` Cookie |
| 修改 | `src/lib/store.ts` | `ensureStore`, `writeStore`, `getStoreSnapshot`, `upsertSubmission`, `deleteSubmission` | 支援 `OGSTM_DATA_DIR` 測試覆寫；改為 `.tmp` + `renameSync` 原子寫入與 `.bak` 損毀回退；消除 `touchSession` 二次讀寫；保留既有 `confidence` |
| 修改 | `src/lib/types.ts` | `VoteQuestion`, `HistoricalOptionRow` | 新增 `greenLabel`、`redLabel`、`maxGreen`、`maxRed` 與 `HistoricalOptionRow.optionLabel` |
| 修改 | `src/data/template.json` | `questions[0..1]` | 補齊 G 卷（紅＝最易忽略）與 T 卷（紅＝最不易執行）語意標籤與上限提示值 `5` |
| 修改 | `src/lib/template.ts` | `validateAndNormalizeVotes` | 新增伺服器端提交 `votes` 結構與 `0 \| 1` 整數驗證函式 |
| 修改 | `src/lib/history.ts` | `buildHistoryOverview`, `buildPublicSummary` | 改用 `getStoreSnapshot()` 單次讀檔聚合；補上 `optionLabel`；摘要文案改用各題 `greenLabel` / `redLabel` |
| 修改 | `src/app/page.tsx` | 模組層級設定 | 新增 `export const dynamic = "force-dynamic";` 解決靜態預渲染凍結問題 |
| 修改 | `src/components/PublicStatsHome.tsx` | 排行標題與 Footer | 動態顯示題本綠／紅語意標籤；移除頁尾公開的 `<Link href="/ops">` |
| 修改 | `src/app/ops/page.tsx`、`src/app/session/[id]/page.tsx`、`manual/page.tsx`、`photo/page.tsx` | Page Server Component | 呼叫 `await requireOpsPage(currentPath)` 保護助教營運頁面（不影響 `/present` 與 `/live`） |
| 修改 | `src/app/api/sessions/route.ts` | `GET`, `POST` | 加入 `requireOpsApi()` 與安全 JSON 解析 |
| 修改 | `src/app/api/sessions/[id]/route.ts` | `PATCH`, `DELETE` | `PATCH` 加入 `requireOpsApi()`；`DELETE` 強制加入 `requireAdminApi()`；`GET` 維持免登入供講師輪詢 |
| 修改 | `src/app/api/sessions/[id]/submissions/route.ts` | `GET`, `POST` | 加入 `requireOpsApi()`，並呼叫 `validateAndNormalizeVotes` 嚴格檢核輸入 |
| 修改 | `src/app/api/sessions/[id]/submissions/[groupId]/route.ts` | `GET`, `DELETE` | `GET` 加入 `requireOpsApi()`；`DELETE` 強制加入 `requireAdminApi()` |
| 修改 | `src/app/api/export/[id]/route.ts` | `GET` | 加入 `requireOpsApi()`；套用 `escapeCsvCell`、`buildCsvHeaders`（修復中文檔名 500）並補上選項說明欄 |
| 修改 | `src/app/api/export/all/route.ts` | `GET` | 改用單次快照避免 `3N+1` 次讀檔；套用 `escapeCsvCell` 並補上選項說明欄 |
| 修改 | `src/app/api/admin/login/route.ts`、`logout/route.ts`、`src/components/AdminLoginForm.tsx` | 登入／登出流程 | 加入 IP 限流、動態 `secure` Cookie、安全 `sanitizeNextPath`（修雙重 `basePath` 與 Open Redirect）、登出 `303` 重導向 |
| 修改 | `src/app/api/recognize/route.ts`、`openrouter/route.ts` | `POST` | 加入 `requireOpsApi()`、4MB 大小與 MIME 白名單檢查 |
| 修改 | `src/lib/vertex-recognize.ts`、`openrouter-recognize.ts`、`vertex-auth.ts` | 上游呼叫與憑證 | 加入 25s `AbortSignal.timeout`、先讀 `text()` 防非 JSON 英文錯誤、補上 Vertex `responseSchema`、認證失敗重置 `cachedAuth` |
| 修改 | `src/components/ManualInputForm.tsx`、`PhotoInputForm.tsx`、`VoteCounter.tsx` | 表單互動與標籤 | 儲存後清空 `groupId`；自動查詢同組既有紀錄防誤覆蓋；顯示 `綠 X / 紅 Y` 與雙勾提醒；加入取消 AI 辨識與 unmount 釋放預覽 URL；套用動態 `redLabel` |
| 修改 | `src/components/PresenterView.tsx`、`LiveStatsView.tsx`、`StatsTable.tsx`、`HistoricalStatsTable.tsx` | 輪詢與表格顯示 | 套用動態 `redLabel`；輪詢補上 `try/catch`、`no-store`、斷線提示與背景分頁暫停；後台歷史表顯示選項中文說明 |
| 修改 | `src/app/layout.tsx`、`src/app/globals.css` | 字體載入 | 改用 `next/font/google` 自託管 `Fira Sans` / `Fira Code`，移除阻塞式外部 `@import` |
| 修改 | `Dockerfile`、`scripts/deploy.sh`、`.env.example`、`README.md`、`DEPLOY-FTP.md` | 部署與文件 | 修正 Docker `data` 打包與 `ARG`、部署備份保留 30 份、更新最新環境變數與 0/1 勾選說明 |

---

## 4. 向下相容、備份遷移與回滾策略

### 4.1 資料與環境變數向下相容
1. **`data/store.json` 零遷移成本**：`Session` 與 `Submission` 磁碟 JSON Schema 完全不變，既有線上歷史場次與各組票數可直接無縫讀取，無須執行資料轉換腳本。
2. **環境變數零中斷過渡**：
   - 新增之 `OPS_PASSWORD` 與 `COOKIE_SECURE` 均為選填：未設定 `OPS_PASSWORD` 時自動沿用既有 `ADMIN_PASSWORD`；既有 `.env.production.local` 不修改也能正常啟動。
   - 既有管理員 Cookie 因簽章演算法由純 SHA-256 升級為 HMAC-SHA256，部署後團隊成員只需重新登入一次即可，不影響任何課程資料。
3. **講師連結完全相容**：`/session/[id]/live` 與 `/session/[id]/present` 網址與免登入行為維持 100% 不變。

### 4.2 部署前備份與快速回滾步驟
1. **部署前強制備份**：`scripts/deploy.sh` 已會在更新前將 `data/store.json` 備份至 `/home/deploy/ogstm-backups/store-deploy-<timestamp>.json`。
2. **異常快速回滾（1 分鐘內完成）**：
   - 因 `store.json` 格式未變，若新版本出現任何非預期問題，於 VPS 執行以下指令即可無損回滾至本次審計基準版本 `53ea66a`：
     ```bash
     sudo -u deploy bash -lc '
       cd /home/deploy/ogstm-stats &&
       git checkout 53ea66a &&
       npm ci &&
       npm run build &&
       pm2 restart ogstm-stats
     '
     ```
   - 若需還原資料檔，直接將 `/home/deploy/ogstm-backups/` 最新備份複製回 `/home/deploy/ogstm-stats/data/store.json` 即可（無須重啟 Node 程序，下次請求即讀取還原後檔案）。

---

## 5. 驗收標準（Acceptance Criteria）與測試計畫

### 5.1 功能與資安驗收清單
- [ ] **CSV 中文檔名與防注入（`OPT-01`）**：建立名稱為 `課程 2026/11/25 A, B 班` 與組別含 `=1+1` 的測試場次，下載 `/api/export/[id]` 回傳 HTTP `200`（不再拋出 `ByteString` 500），Excel 開啟中文正常、欄位不因逗號偏移，且公式字串前置 `'` 不被執行。
- [ ] **權限隔離與免登入投影並存（`OPT-02`）**：
  - [ ] 無 Cookie 狀態訪問公開首頁 `/`，頁尾不再出現 `/ops` 連結。
  - [ ] 無 Cookie 狀態呼叫 `GET /api/sessions`、`DELETE /api/sessions/[id]`、`POST /api/sessions/[id]/submissions`、`GET /api/export/[id]`、`POST /api/recognize` 皆回傳 HTTP `401`。
  - [ ] 無 Cookie（無痕視窗）直接開啟 `/session/[id]/live` 與 `/session/[id]/present`，可正常載入統計並每 20 秒／5 秒自動更新。
- [ ] **首頁動態更新與儲存保護（`OPT-03`）**：執行生產模式 `npm run build && npm run start` 後，新增一場次並輸入票數，重新整理首頁 `/` 立即反映最新累計場次與組別數；傳送 `{ votes: { vote_1: { a: { green: "1", red: -1 } } } }` 至提交 API 時回傳 HTTP `400`。
- [ ] **課堂防誤覆蓋與 G/T 語意（`OPT-04`）**：
  - [ ] 於手動頁與拍照頁儲存第 `1` 組後，組別欄自動清空。
  - [ ] 再次輸入組別 `1`，自動載入第 `1` 組既有勾選並顯示覆寫提醒橫幅。
  - [ ] 切換至 T 卷（`vote_2`）時，手動頁、拍照頁、講師口述頁、講師即時頁與彙整表皆顯示「紅 · 最不易執行」；G 卷（`vote_1`）顯示「紅 · 最易忽略」。
- [ ] **路由與登入防護（`OPT-05`）**：
  - [ ] 設定 `NEXT_PUBLIC_BASE_PATH=/stats` 建置啟動後，未登入訪問 `/stats/admin` 正確導向 `/stats/admin/login`（無 `/stats/stats` 重複前綴）。
  - [ ] 訪問 `/admin/login?next=//example.com` 登入後安全導回 `/admin`，不跳轉外部網站；點擊「登出」回傳 `303` 並正常開啟登入頁。
  - [ ] 連續輸入錯誤密碼第 6 次回傳 HTTP `429`。
- [ ] **AI 辨識韌性與取消機制（`OPT-06`、`OPT-07`）**：模擬上游回傳 HTML `502 Bad Gateway` 時，拍照頁顯示繁體中文友善錯誤訊息（不出現 `Unexpected token '<'`）；辨識進行中點擊「取消」可立即解除鎖定並手動勾選。
- [ ] **容器與建置檢查（`OPT-09`、`OPT-10`）**：`npm test`、`npm run lint` 與 `npm run build` 全部零錯誤通過。

### 5.2 可執行驗證指令
實作完成後，依序執行以下指令驗證：

```bash
# 1. 執行單元測試（排名、CSV 編碼、票數驗證、原子寫入、LLM 正規化）
npm test

# 2. 靜態型別與 ESLint 檢查
npx tsc --noEmit
npm run lint

# 3. 正式環境建置驗證（確認無編譯錯誤，且 `/` 標記為 ƒ Dynamic 而非 ○ Static）
npm run build

# 4. 子路徑建置冒煙驗證
NEXT_PUBLIC_BASE_PATH=/stats npm run build
```
