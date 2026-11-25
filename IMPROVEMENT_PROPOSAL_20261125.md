# ogstm-stats 優化改善建議書

- **檢視日期**：2026-11-25
- **目標專案**：`ogstm-stats`（OGSTM 課堂思考圖表決統計系統）
- **檢視基準 Commit**：`53ea66a`（`main` 分支，工作區乾淨無未提交變更）

---

## 1. 專案定位與現況盤點

### 1.1 技術棧與核心架構
- **框架與語言**：Next.js `16.2.9`（App Router，`output: "standalone"`）、React `19.2.4`、TypeScript `5`、Tailwind CSS `4`。
- **執行與部署環境**：Node.js 20+、PM2 常駐程序、Nginx 反向代理（支援根網域如 `https://ogstm.spq.tw` / `stats.ogstm.com`，或子路徑 `NEXT_PUBLIC_BASE_PATH=/stats`）；另備有 `Dockerfile`、`scripts/deploy.sh`（SSH 一鍵部署）與 `scripts/pack-deploy.mjs`（FTP 打包）。
- **資料儲存**：單機檔案儲存 `data/store.json`（結構為 `{ sessions, submissions }`），模板定義於 `src/data/template.json`（含 `vote_1` G 卷 14 題、`vote_2` T 卷 10 題）。
- **拍照辨識架構**：雙軌 LLM Vision（Vertex AI `gemini-3.5-flash` 透過 OAuth ADC `google-auth-library` 認證、OpenRouter `nvidia/nemotron-nano-12b-v2-vl:free`）優先預填，前端 Canvas HSV 色彩分析（`src/lib/recognize.ts`）為本地備援，並強制經助教人工確認後才送出儲存。
- **核心入口路由**：
  - 公開區：`/`（`src/app/page.tsx`，跨場次歷史加總與排行）、`/api/public/stats`。
  - 助教營運區：`/ops`、`/session/[id]`（彙整）、`/session/[id]/manual`（手動勾選）、`/session/[id]/photo`（拍照 AI 預填）。
  - 講師投影／檢視區（免登入）：`/session/[id]/present`（5 秒輪詢前 5 名口述視圖）、`/session/[id]/live`（20 秒輪詢排行＋完整統計表）。
  - 團隊管理後台（Cookie 驗證）：`/admin/login`、`/admin`、`/admin/sessions/[id]`、`/api/history`、`/api/export/all`。

### 1.2 已核對之既有文件與交班脈絡摘要
本次審計已先完整核對 `README.md`、`DEPLOY-FTP.md`、`docs/SPECIFICATION.md`、`docs/實作說明-2026-06-25.md` 與 `docs/交班單-2026-06-25.md`，確認以下設計取捨與已知待辦，**不重複提報為未知缺陷**：
1. **0/1 勾選制取代舊版人次步進器**：v1.1–v1.2 已確認紙本規則為每格僅 `0` 或 `1`（G 卷：綠＝最重要、紅＝最易忽略；T 卷：綠＝最重要、紅＝最不易執行）。
2. **ROI 尚未標定屬已知待辦**：`src/data/template.json:65` 的 `"rois": {}` 為已知未標定狀態，現階段以 LLM Vision 搭配人工確認為主、`/manual` 手動輸入為保底。
3. **OAuth ADC 取代 Service Account JSON**：因 GCP 組織政策限制建立 SA 金鑰，伺服器端採 OAuth ADC（`/home/deploy/.gcp/adc.json`）屬刻意架構選擇。
4. **講師即時頁免登入設計**：v1.3（commit `cc6dad4`）刻意新增 `/session/[id]/live` 讓講師憑連結免登入查看統計，改善建議將完整保留此免登入體驗。

---

## 2. 優化改善項目總覽表

| 編號 | 優先級 | 類別 | 問題摘要 | 證據位置（`檔案:行號`） | 預估改動規模 |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `OPT-01` | **P0** | 功能錯誤／匯出安全 | 單場次 CSV 匯出因中文檔名觸發 Node `ByteString` 例外 500 崩潰；全站 CSV 未跳脫逗號與公式注入字元 | `src/app/api/export/[id]/route.ts:21-71`<br>`src/app/api/export/all/route.ts:14-65`<br>`src/app/api/sessions/route.ts:11` | `S` |
| `OPT-02` | **P0** | 資安與權限控管 | 刪除／寫入／場次列表／AI 辨識 API 完全無認證，且公開首頁直接暴露 `/ops` 入口，違反規格書隔離原則 | `src/components/PublicStatsHome.tsx:127-133`<br>`src/app/api/sessions/[id]/route.ts:24-44`<br>`src/app/api/sessions/[id]/submissions/[groupId]/route.ts:17-24`<br>`src/app/api/recognize/route.ts:7-63` | `M` |
| `OPT-03` | **P0** | 資料渲染與儲存一致性 | 公開首頁遭 Next.js 靜態預渲染凍結舊資料；`store.json` 非原子覆寫且重複讀寫、提交 API 無數值型別驗證 | `src/app/page.tsx:1-7`<br>`src/lib/store.ts:15-34, 102-172`<br>`src/app/api/sessions/[id]/submissions/route.ts:25-49`<br>`src/lib/aggregate.ts:19-25` | `M` |
| `OPT-04` | **P1** | 課堂操作防呆與語意 | 「儲存並下一組」未清空組別且未載入同組既有紀錄易誤覆蓋；T 卷紅格語意於投影與輸入頁全數誤植為「最易忽略」 | `src/components/ManualInputForm.tsx:23-31, 93-98, 138`<br>`src/components/PhotoInputForm.tsx:28-32, 208-219`<br>`src/components/PresenterView.tsx:150, 177`<br>`src/data/template.json:5-64` | `M` |
| `OPT-05` | **P1** | 路由與認證安全 | 子路徑雙重 `basePath` 造成 404、`next=//evil.com` 開放重導向、登出 `307` 方法錯誤、登入無限流與 HTTP IP Cookie 衝突 | `src/lib/auth.ts:7-18, 25-31, 38-46`<br>`src/components/AdminLoginForm.tsx:32`<br>`src/app/api/admin/login/route.ts:9-29`<br>`src/app/api/admin/logout/route.ts:7-11` | `S` |
| `OPT-06` | **P1** | AI 辨識韌性 | 上游 LLM `fetch` 無逾時與取消機制，且在檢查 `response.ok` 前直接解析 JSON，引發交班單所載「英文 JSON 錯誤」 | `src/lib/vertex-recognize.ts:53-87`<br>`src/lib/openrouter-recognize.ts:60-88`<br>`src/lib/vertex-auth.ts:7, 27-35, 77-85`<br>`src/app/api/recognize/route.ts:58-62` | `M` |
| `OPT-07` | **P1** | 前端輪詢與錯誤處理 | 講師視圖輪詢未捕獲斷網例外且背景分頁持續輪詢；多處表單未共用 `readJsonResponse`、照片預覽未釋放記憶體 | `src/components/PresenterView.tsx:26-39`<br>`src/components/LiveStatsView.tsx:24-37`<br>`src/components/ManualInputForm.tsx:87-91`<br>`src/components/PhotoInputForm.tsx:45, 202-206` | `S` |
| `OPT-08` | **P2** | I/O 效能與後台可讀性 | 歷史統計與全量匯出存在 `3N + 1` 次同步讀檔放大；後台歷史統計表與 CSV 缺少選項中文說明 | `src/lib/history.ts:18-27, 54-75`<br>`src/app/api/export/all/route.ts:13-22`<br>`src/components/HistoricalStatsTable.tsx:40-58` | `S` |
| `OPT-09` | **P2** | 容器化與部署維運 | 缺少 `.dockerignore` 致機密與本機資料進映像檔、`deploy.sh` 原地建置短暫中斷服務、Google Fonts `@import` 阻塞渲染 | `Dockerfile:10-31`<br>`scripts/deploy.sh:21-31`<br>`src/app/globals.css:1`<br>`README.md:8-18` | `S` |
| `OPT-10` | **P2** | 自動化測試缺口 | 核心並列排名、分階段票數合併、CSV 編碼與 LLM 回傳正規化缺乏基礎單元測試 | `package.json:5-13`<br>`src/lib/presenter.ts:27-100`<br>`src/lib/llm-recognize-shared.ts:51-113` | `S` |

---

## 3. 逐項深度診斷與建議

### `OPT-01`（P0）單場次 CSV 匯出因中文檔名觸發 `ByteString` 500 崩潰，且未跳脫逗號與公式字元

- **【事實與程式碼證據】**
  1. `src/app/api/sessions/route.ts:11` 建立課程預設名稱為 `` `課程 ${new Date().toLocaleString("zh-TW")}` ``（必含中文字元）。
  2. `src/app/api/export/[id]/route.ts:64` 以 `session.name.replace(/[^\w\u4e00-\u9fff-]+/g, "_")` 產生檔名（保留中文字元），並於第 `66-70` 行直接放入 `new NextResponse(csv, { headers: { "Content-Disposition": \`attachment; filename="${filename}"\` } })`。在 Node.js 20/22 內建 `undici` 的 Web `Headers` 規範中，Header 值僅允許 ISO-8859-1（字元碼 `<= 255`），傳入 `'課'`（字元碼 `35506`）會立即拋出 `TypeError: Cannot convert argument to a ByteString`。
  3. `src/app/api/export/[id]/route.ts:30-41, 50-59` 與 `src/app/api/export/all/route.ts:25-37, 46-56` 直接使用 `.join(",")` 串接 `session.name`、`groupId`、`question.label`，未處理欄位內的逗號、雙引號與換行，亦未轉義 `=`、`+`、`-`、`@` 開頭字串。
- **【風險與影響】**
  - **單場次匯出功能實質損壞**：所有使用預設名稱或中文名稱的課程，點擊「CSV / 匯出」皆直接回傳 HTTP 500，無法下載課後分析檔。
  - **欄位錯位與 CSV Injection**：課程名稱若含逗號（如 `"企業班 A, B 組"`）會導致 Excel 欄位全面偏移；若遭填入 `=HYPERLINK(...)` 等公式字串，管理者以 Excel 開啟匯出檔時具公式執行風險。
- **【具體改善方向】**
  1. 抽共用 `src/lib/csv.ts`：實作 RFC 4180 欄位跳脫函式 `escapeCsvCell(value)`，並對以 `=`、`+`、`-`、`@`、`\t`、`\r` 開頭之文字前置單引號 `'` 防範公式注入。
  2. `Content-Disposition` 改採 RFC 5987 雙參數格式：`attachment; filename="session_${id.slice(0, 8)}_stats.csv"; filename*=UTF-8''${encodeURIComponent(utf8Filename)}`，兼顧純 ASCII 相容性與中文檔名顯示。

---

### `OPT-02`（P0）營運與刪除／AI 辨識 API 缺乏認證保護，且公開首頁直接暴露營運入口

- **【事實與程式碼證據】**
  1. `docs/SPECIFICATION.md:147, 217, 630-631` 明定：「刪除課程僅管理者」、「助教營運頁不出現在公開導覽」、「公開頁不暴露單場次各組明細」。
  2. `src/components/PublicStatsHome.tsx:127-133` 卻在公開首頁頁尾直接渲染 `<Link href="/ops">營運入口</Link>`。
  3. 以下敏感端點完全沒有任何權限檢查：
     - 刪除端點：`DELETE /api/sessions/[id]`（`src/app/api/sessions/[id]/route.ts:37-44`）與 `DELETE /api/sessions/[id]/submissions/[groupId]`（`src/app/api/sessions/[id]/submissions/[groupId]/route.ts:17-24`）。
     - 場次列舉與各組明細：`GET /api/sessions`（`src/app/api/sessions/route.ts:5-7`）、`GET /api/export/[id]`（`src/app/api/export/[id]/route.ts:10-20`）、`GET /api/sessions/[id]/submissions`（`src/app/api/sessions/[id]/submissions/route.ts:9-16`）。
     - 寫入端點：`POST /api/sessions`、`PATCH /api/sessions/[id]`、`POST /api/sessions/[id]/submissions`。
     - 外部計費 AI 端點：`POST /api/recognize`（`src/app/api/recognize/route.ts:7-63`）與 `POST /api/recognize/openrouter`（`src/app/api/recognize/openrouter/route.ts:8-60`），且未檢查 `imageBase64` 長度與 `mimeType` 白名單。
- **【風險與影響】**
  - **全庫清空與歷史資料竄改風險**：外部訪客或爬蟲只需呼叫 `GET /api/sessions` 取得所有場次 UUID，即可迴圈呼叫 `DELETE /api/sessions/:id` 瞬間清空整份 `data/store.json`，或任意寫入假票數污染公開首頁歷史趨勢、下載單場各組明細。
  - **雲端帳單濫用風險**：外部可無限制發送大型 Base64 請求至 `/api/recognize`，直接消耗 GCP `ogstm-input` 專案 Vertex AI 額度與 OpenRouter API 配額。
- **【具體改善方向】**
  1. 移除 `PublicStatsHome.tsx:127-133` 公開頁尾的 `/ops` 連結。
  2. `DELETE /api/sessions/[id]` 與 `DELETE /api/sessions/[id]/submissions/[groupId]` 強制通過 `requireAdminApi()`。
  3. 導入輕量營運認證（支援設定 `OPS_PASSWORD`，未設定時自動回退共用 `ADMIN_PASSWORD`）：助教進入 `/ops`、`/session/[id]/manual`、`/session/[id]/photo` 時驗證一次密碼並寫入 7 天 HttpOnly Cookie；`GET/POST /api/sessions`、`PATCH /api/sessions/[id]`、`GET/POST /api/sessions/[id]/submissions`、`GET /api/export/[id]`、`/api/recognize*` 均要求營運或管理員 Cookie。
  4. **保留講師零登入體驗**：`/session/[id]/live`、`/session/[id]/present` 與單場統計查詢 `GET /api/sessions/[id]` 維持憑 UUID 免登入存取（因 `GET /api/sessions` 已受保護，外部無法列舉 UUID；另於 `GET /api/sessions/[id]` 回傳給免登入端時可維持既有彙整結構）。
  5. 於 `/api/recognize*` 加入伺服器端 Payload 防護：限制圖片原始大小 `<= 4MB`（`imageBase64.length <= 5_600_000`）且 `mimeType` 僅允許 `image/jpeg`、`image/png`、`image/webp`。

---

### `OPT-03`（P0）公開首頁遭 Next.js 靜態預渲染凍結舊資料，且 `store.json` 缺乏原子寫入與提交資料驗證

- **【事實與程式碼證據】**
  1. `src/app/page.tsx:1-7` 的 `HomePage` 同步讀取 `buildPublicSummary()`，但未宣告 `export const dynamic = "force-dynamic"`，亦未使用 `cookies()` / `headers()`，且所有寫入 API 均未呼叫 `revalidatePath("/")`。在 Next.js 16 `npm run build` 時，`/` 會被預先編譯為靜態 HTML 快取。
  2. `src/lib/store.ts:29-34` 的 `writeStore` 直接對 `data/store.json` 執行 `writeFileSync`（非原子截斷寫入），而第 `26` 行 `JSON.parse(readFileSync(STORE_PATH, "utf-8"))` 無例外復原機制；此外 `upsertSubmission`（第 `128-129, 145-146` 行）與 `deleteSubmission`（第 `157-159` 行）先呼叫 `writeStore(store)`，緊接著呼叫 `touchSession()` 又重新 `ensureStore()` 並 `writeStore()`，單次儲存重複讀寫磁碟兩次。
  3. `src/app/api/sessions/[id]/submissions/route.ts:25-49` 僅檢查 `if (!body.votes)`，完全未驗證 `votes` 是否符合模板題號／選項及 `0 | 1` 數值型別；若收到字串 `"1"` 或負數，`src/lib/aggregate.ts:22-23`（`green += counts.green`）會直接做字串串接（如 `0 + "1" === "01"`）。
- **【風險與影響】**
  - **公開統計頁資料停滯**：課堂新增的場次與票數在下次重新 `npm run build` 前不會更新至首頁 `/`；若透過 Docker 或本機空 `data/` 打包部署，首頁更會永久顯示 `0` 場次。
  - **磁碟檔案損毀與全站癱瘓**：若寫入瞬間遇 `pm2 restart` 或系統中斷，`store.json` 截斷成不完整 JSON 將使全站所有頁面與 API 拋出未捕獲例外（HTTP 500）。【待環境確認】若正式機 PM2 設定為 `cluster` 多行程模式而非單行程 `fork` 模式，併發寫入亦會造成後寫覆蓋前寫（Lost Update）。
  - **髒資料污染跨場次統計**：異常型別寫入 `store.json` 後會連帶破壞 `/session/[id]`、`/admin` 與 `/` 的加總與百分比計算。
- **【具體改善方向】**
  1. 在 `src/app/page.tsx` 加入 `export const dynamic = "force-dynamic";`，確保首頁每次請求讀取最新統計。
  2. 改寫 `src/lib/store.ts` 的 `writeStore` 為同目錄暫存檔原子替換（`writeFileSync(tmpPath, json)` → `renameSync(tmpPath, STORE_PATH)`），寫入前保留一份 `store.json.bak` 並在 `ensureStore` 解析失敗時記錄錯誤與安全回退；將 `touchSession` 合併至記憶體內一次寫入完成。
  3. 在 `submissions/route.ts` 與所有 JSON API 加入安全 `parseJsonBody` 與模板結構淨化函式 `sanitizeSubmissionVotes(template, rawVotes)`，僅保留合法題目與選項，並將 `green` / `red` 正規化為非負整數（勾選模式下強制 `0 | 1`），同時修正分時段更新時 `confidence: undefined` 覆蓋既有欄位之問題（`src/lib/store.ts:121-126`）。

---

### `OPT-04`（P1）手動／拍照輸入「儲存並下一組」未清空組別且未載入既有紀錄易誤覆蓋；T 卷紅格語意誤植

- **【事實與程式碼證據】**
  1. `src/components/ManualInputForm.tsx:93-98, 192` 與 `src/components/PhotoInputForm.tsx:208-219, 373` 按鈕文案皆為「儲存並下一組」，送出成功後雖將勾選狀態重置為全 `0`，卻**未清空或遞增 `groupId` state**。
  2. 後端雖已備妥單組查詢 API `GET /api/sessions/[id]/submissions/[groupId]`（`src/app/api/sessions/[id]/submissions/[groupId]/route.ts:8-15`），但前端 `ManualInputForm` 與 `PhotoInputForm` 均從未呼叫。
  3. `docs/交班單-2026-06-25.md:156-157` 載明 G 卷紅格為「最易忽略」、T 卷紅格為「**最不易執行**」；但 `ManualInputForm.tsx:138`、`VoteCounter.tsx:120, 147`、`PresenterView.tsx:150, 177`、`LiveStatsView.tsx:117`、`StatsTable.tsx:25` 全部硬編碼為「最易忽略」，`PublicStatsHome.tsx:61, 94` 與 `src/lib/history.ts:216, 221` 則仍沿用早期「贊成／反對」字樣。
  4. `ManualInputForm.tsx:39-44, 141` 僅顯示合併的 `已勾 {markedCount} 項`，`PhotoInputForm` 則完全未顯示已勾數量；同選項同時勾選綠與紅時亦無視覺警示。
- **【風險與影響】**
  - **課堂誤覆蓋高風險**：助教於手機連續輸入多組時，極易因 `groupId` 停留在上一組組別而將新組別資料直接覆蓋上一組，或重複點擊送出把剛存好的組別覆蓋為全 `0`；若要補改某組單一選項，也必須整題重勾否則舊選項會歸零。
  - **課堂投影語意混淆**：講師投影 T 卷（戰術作法）時，大螢幕顯示「紅 · 最易忽略」與學員手上的紙本「最不易執行」不一致。
- **【具體改善方向】**
  1. 儲存成功後立即將 `groupId` 清空 `setGroupId("")`（並捲回頂部聚焦組別欄或顯示醒目 Toast）。
  2. 當助教輸入 `groupId`（debounce 300ms 或 `onBlur`）或切換題目時，自動查詢 `GET /api/sessions/${sessionId}/submissions/${encodeURIComponent(groupId)}`：若該組該題已有紀錄（且拍照頁尚未載入新照片預填），自動帶入既有勾選並顯示提示條「已載入第 X 組既有紀錄，儲存將更新此組」。
  3. 於 `src/data/template.json` 各題補上 `greenLabel: "最重要"`、`redLabel`（`vote_1`: `"最易忽略"`、`vote_2`: `"最不易執行"`），全站元件統一讀取模板欄位，消除硬編碼。
  4. 表頭改顯示獨立計數 `綠 {greenCount} · 紅 {redCount}`；當單色超過 5 項或同一選項紅綠雙勾時以琥珀色提示（不阻擋儲存，保留紙本異常勾選之登錄彈性）。

---

### `OPT-05`（P1）子路徑雙重 `basePath` 404、開放重導向、登出 `307` 方法錯誤與認證強化

- **【事實與程式碼證據】**
  1. `src/lib/auth.ts:29` 呼叫 `redirect(appPath("/admin/login"))`，`src/components/AdminLoginForm.tsx:32` 呼叫 `router.push(appPath(nextPath?.startsWith("/") ? nextPath : "/admin"))`。Next.js App Router 的 `redirect()` 與 `router.push()` 本身已會自動附加 `next.config.ts` 的 `basePath`。
  2. `AdminLoginForm.tsx:32` 僅驗證 `nextPath?.startsWith("/")`，未排除 `//` 開頭之協定相對網址（如 `//evil.com`）。
  3. `src/app/api/admin/logout/route.ts:10` 對 `POST` 表單回傳 `NextResponse.redirect(`${getSiteUrl()}${appPath("/admin/login")}`)`（預設 HTTP `307` 且硬編碼 `getSiteUrl()`）。
  4. `src/lib/auth.ts:7-18` 的 `ADMIN_SESSION_SECRET` 預設回退至固定字串 `"ogstm-stats"`，以一般 `===` 比對雜湊，`src/app/api/admin/login/route.ts:9-29` 無登入錯誤次數限制；另 `auth.ts:41` 在 `NODE_ENV === "production"` 一律設定 `secure: true`。
- **【風險與影響】**
  - 當採用 `DEPLOY-FTP.md` 的子路徑方案（`NEXT_PUBLIC_BASE_PATH=/stats`）時，未登入導轉與登入成功跳轉皆會變成 `/stats/stats/...` 導致 404。
  - `/admin/login?next=//evil.com` 構成 Open Redirect 釣魚漏洞。
  - 點擊後台「登出」時，`307` 會使瀏覽器對 `/admin/login` 發送 `POST` 請求而非 `GET`；且若從內網或 VPS IP 操作會被強制導向 `NEXT_PUBLIC_SITE_URL`。
  - 【待環境確認】若維運人員依《交班單》第 `37` 行使用純 HTTP IP（`http://165.232.161.37/admin/login`）於正式環境登入，瀏覽器會因 `Secure` 屬性拒絕傳送 Cookie，導致輸入正確密碼後仍跳回登入頁。
- **【具體改善方向】**
  1. `auth.ts:29` 改為 `redirect("/admin/login")`；`AdminLoginForm.tsx:32` 移除多餘的 `appPath()`，並以安全函式驗證 `nextPath`（必須以單一 `/` 開頭且不以 `//` 或 `/\\` 開頭）。
  2. `logout/route.ts:10` 改用 `NextResponse.redirect(new URL(appPath("/admin/login"), request.url), { status: 303 })`。
  3. Token 簽章改用 `createHmac("sha256", secret)` 搭配 `crypto.timingSafeEqual` 常數時間比對；於 `login` 端點加入輕量記憶體內 IP 限流（例如每分鐘最多 5 次失敗嘗試，回傳 `429`）。
  4. Cookie `secure` 屬性改依請求實際協定動態判斷（檢查 `x-forwarded-proto === "https"` 或 `request.url` 為 `https:`，並支援環境變數 `COOKIE_SECURE=true|false` 強制覆寫）。

---

### `OPT-06`（P1）LLM 辨識請求無逾時控制且未防護非 JSON 錯誤頁，引發「英文 JSON 錯誤」

- **【事實與程式碼證據】**
  1. `src/lib/vertex-recognize.ts:82` 與 `src/lib/openrouter-recognize.ts:84` 皆在判斷 `if (!response.ok)` 之前直接呼叫 `await response.json()`。
  2. `src/app/api/recognize/route.ts:58-61` 將捕獲之 `error.message` 原文包入 `{ error: message }`（HTTP 500 JSON）回傳前端。
  3. 兩處上游 `fetch` 均未傳入 `AbortSignal.timeout()`，前端 `PhotoInputForm.tsx:85-114` 亦無 `AbortController` 取消按鈕；`vertex-recognize.ts:74-78` 未指定 `responseSchema`；`src/lib/vertex-auth.ts:7, 27-35` 將 `cachedAuth` 永久快取於模組變數，認證失敗時不重置且直接拋出英文錯誤。
- **【風險與影響】**
  - **直接對應交班單已知痛點**：當 OpenRouter 免費節點或閘道回傳 HTML 502/504/429 頁面時，伺服器端 `response.json()` 拋出英文 `SyntaxError: Unexpected token '<'...` 並轉送前端顯示，正是《交班單》第 `260` 行所載「拍照顯示英文 JSON 錯誤」的根本原因。
  - **課堂手機卡死**：上游模型無回應時，助教手機按鈕停留在 disabled 狀態長達 60–120 秒無法重試或切換模型。
  - **OAuth 更新後需重啟**：VPS 更新 `/home/deploy/.gcp/adc.json` 或遇 `invalid_grant` 時，`cachedAuth` 不會自動重載，且錯誤訊息不利助教與維運快速判讀。
- **【具體改善方向】**
  1. 伺服器端上游呼叫統一先 `await response.text()` 再嘗試 `JSON.parse`，非 JSON 或 5xx/429/逾時一律轉譯為明確繁體中文錯誤訊息（如「AI 服務忙碌或回應逾時，請改選另一模型或直接手動勾選」），並加入 `AbortSignal.timeout(25_000)`。
  2. `PhotoInputForm` 加入 `AbortController` 與「取消辨識（直接手動勾選）」按鈕。
  3. `vertex-recognize.ts` 補上 `responseSchema` 強制結構化輸出；`vertex-auth.ts` 在 `getAccessToken()` 拋錯時清空 `cachedAuth = null`，並將 `invalid_grant` 轉譯為提示更新 Vertex OAuth 憑證之中文說明。

---

### `OPT-07`（P1）講師視圖輪詢未捕獲網路例外、多處表單缺少安全 JSON 解析與預覽記憶體釋放

- **【事實與程式碼證據】**
  1. `src/components/PresenterView.tsx:26-39` 與 `src/components/LiveStatsView.tsx:24-37` 的 `refresh()` 直接執行 `await fetch(...)` 與 `await response.json()`，未包覆 `try/catch`、未傳 `cache: "no-store"`，亦未在背景分頁（`document.visibilityState === "hidden"`）暫停輪詢。
  2. `src/components/ManualInputForm.tsx:88`、`PhotoInputForm.tsx:203`、`AdminLoginForm.tsx:27`、`OpsHome.tsx:16` 皆直接呼叫 `response.json()`，未使用 `src/lib/fetch-json.ts` 的 `readJsonResponse`。
  3. `src/components/PhotoInputForm.tsx:45, 120-125` 建立 `URL.createObjectURL(file)` 存入 `previewUrlRef`，但缺少元件卸載時的 `useEffect` 清理函式。
- **【風險與影響】**
  - 教室投影電腦或手機遇 WiFi 瞬斷時，每 5 秒產生未捕獲例外，且講師無法從畫面得知目前顯示的是斷線前舊資料；若儲存瞬間遇閘道 502 HTML，`response.json()` 拋錯會導致表單未正常顯示錯誤提示。
- **【具體改善方向】**
  1. `PresenterView` 與 `LiveStatsView` 的 `refresh()` 加上 `try/catch`、`cache: "no-store"`、斷線狀態小標籤（「連線重試中，目前顯示最後更新資料」），並於 `visibilitychange` 切回前景時立即更新、背景時略過輪詢。
  2. 全站前端 `fetch` 統一改用 `readJsonResponse` 並加上 `try/catch` 確保 `saving` / `loading` 在 `finally` 復原；`PhotoInputForm` 補上 unmount `URL.revokeObjectURL` 清理。

---

### `OPT-08`（P2）歷史統計與全量匯出存在 `O(N)` 同步讀檔放大，且後台缺少選項中文說明

- **【事實與程式碼證據】**
  1. `src/lib/history.ts:54-75` 的 `buildHistoryOverview()` 先呼叫 `listSessions()` 讀取解析 `store.json` 一次，接著在 `for (const session of sessions)` 迴圈內逐場呼叫 `listSubmissions(session.id)`（每次皆重新 `readFileSync` + `JSON.parse`）。`src/app/api/export/all/route.ts:13-22` 更在迴圈內再次呼叫 `getSessionStats(item.session.id)`（內含 `getSession` + `listSubmissions` 兩次讀檔）。
  2. `src/components/HistoricalStatsTable.tsx:45-47` 與兩支 CSV 匯出 API 僅輸出代號 `a`–`n`，未輸出 `template.json` 的 `optionLabels` 中文說明。
- **【風險與影響】**
  - 當累積 `N` 場次時，單次全量匯出會觸發 `3N + 1` 次同步磁碟讀取與 JSON 解析（例如 50 場即 151 次），阻塞 Node.js 單執行緒 Event Loop；後台與 CSV 僅有英文字母代號亦降低課後分析效率。
- **【具體改善方向】**
  1. 在 `src/lib/store.ts` 提供單次快照讀取 `getStoreSnapshot()`，讓 `buildHistoryOverview()` 與 `/api/export/all` 於單一請求內僅讀檔一次，並以 `Map<sessionId, Submission[]>` 在記憶體內分組彙整。
  2. 在 `HistoricalOptionRow`、`HistoricalStatsTable` 與兩支 CSV 匯出補上「選項說明」欄位。

---

### `OPT-09`（P2）容器化與部署腳本防護不足、外部字體 `@import` 阻塞渲染與文件落差

- **【事實與程式碼證據】**
  1. 專案無 `.dockerignore`；`Dockerfile:15`（`COPY . .`）與第 `28` 行（`COPY --from=builder /app/data ./data`）會將本機 `node_modules`、`.env*`、`.gcp/` 與 `data/store.json` 複製進容器映像檔，且 `Dockerfile:10-13` 缺少 `NEXT_PUBLIC_MAIN_SITE_URL` 與 `NEXT_PUBLIC_LLM_PROVIDER` 建置參數。
  2. `scripts/deploy.sh:21-31` 每次部署產生無限累積之 `store-deploy-*.json`，且直接於執行中目錄跑 `npm run build` 後才 `pm2 restart`。
  3. `src/app/globals.css:1` 使用 `@import url("https://fonts.googleapis.com/...")` 載入 `Fira Sans` 與 `Fira Code`。
  4. `README.md:8-18` 仍描述舊版「贊成／反對人數」而非現行「0/1 勾選（最重要／最易忽略／最不易執行）」，`DEPLOY-FTP.md:25-31` 亦未列出 LLM 相關環境變數。
- **【風險與影響】**
  - Docker 建置可能外洩本機憑證或將測試資料打包至正式映像檔；`deploy.sh` 在 `npm run build` 清空重寫 `.next/` 的數十秒內，線上請求可能因找不到 chunk 出現短暫 500（【待環境確認】視 VPS PM2 是否直接以 `next start` 指向 `/home/deploy/ogstm-stats/.next` 而定）。
  - 外部 CSS `@import` 在教室行動網路不穩時會延遲首屏文字渲染。
- **【具體改善方向】**
  1. 新增 `.dockerignore` 排除 `node_modules`、`.next`、`.git`、`.env*`、`.gcp`、`data/store.json`、`deploy`；移除 `Dockerfile` 複製本機 `data` 的指令（改由 Volume 掛載並自動初始化空目錄），補齊 `NEXT_PUBLIC_*` `ARG`。
  2. `scripts/deploy.sh` 加入備份保留上限（如保留最近 30 份），並在建置完成確認 `.next/BUILD_ID` 存在後才重啟（或透過 `NEXT_DIST_DIR=.next-build` 建置成功後原子切換 `.next` 目錄，達成近零停機更新）。
  3. 改由 `src/app/layout.tsx` 使用 `next/font/google` 內嵌自託管 `Fira_Sans` 與 `Fira_Code`，移除 `globals.css:1` 外部 `@import`；同步修正 `README.md` 與 `DEPLOY-FTP.md` 說明。

---

### `OPT-10`（P2）核心純邏輯缺乏輕量自動化測試

- **【事實與程式碼證據】**
  - `package.json:5-13` 無 `test` 腳本，專案內無任何測試檔。然而 `src/lib/presenter.ts`（同票並列競爭排名 `assignCompetitionRanks` / `topNWithTies`）、`src/lib/store.ts`（G/T 跨時段合併與原子寫入）、`src/lib/llm-recognize-shared.ts`（`extractJsonObject` 與 `normalizeVotes` 信心分數折減）及新增之 CSV 跳脫邏輯皆為高價值純函式。
- **【風險與影響】**
  - 後續調整模板、匯出格式或計分規則時，缺乏快速驗證手段防範回歸錯誤。
- **【具體改善方向】**
  - 不引入龐大測試框架，直接使用 Node.js 20/22 內建 `node:test` 與 `node:assert/strict`（搭配 TypeScript strip-types 或輕量測試腳本）建立核心單元測試，執行時間 `< 1 秒`。

---

## 4. 明確排除項目（Out of Scope）與建議執行順序

### 4.1 明確排除項目（避免過度設計）
考量 `ogstm-stats` 為聚焦課堂即時統計之精實應用（每場約 12 組、團隊助教與講師內部操作為主），以下方案**明確排除不做**：
1. **不遷移至 PostgreSQL / MySQL 或引入 Prisma / Drizzle ORM**：在補上同目錄暫存檔 `renameSync` 原子寫入與單次快照讀取後，`data/store.json` 在數百場次規模下體積僅數百 KB，讀寫延遲 `< 2ms`，無須增加資料庫伺服器維運成本。
2. **不建置多角色帳號資料庫（RBAC）、OAuth 使用者登入或 Redis Session**：僅需區分「免登入投影連結（UUID）」與「助教營運／後台管理（Cookie）」即可滿足安全需求，記憶體內 IP 限流與 HMAC Cookie 已足夠匹配單機 PM2 架構。
3. **不改寫為 WebSocket / Socket.IO 即時推播**：講師端 5 秒／20 秒 HTTP 輪詢在課堂低併發情境下極為輕量，補齊錯誤捕捉與背景暫停即可，無須維護長連線狀態。
4. **不引入 Playwright / Cypress / Jest 全家桶**：核心風險集中於資料處理、匯出編碼與 API 邊界，使用 Node.js 原生 `node:test` 即可達成高投資報酬率防護。
5. **不硬性阻擋非「5 綠 + 5 紅」之提交，亦不強推前端透視校正演算法**：課堂紙本偶有少勾或多勾之實況，系統應以醒目計數提示助教確認，而非鎖死儲存按鈕阻礙課堂進行。

### 4.2 建議分階段執行順序
1. **第一階段（P0 止血與資安防護，預估 0.5–1 天）**：
   - 完成 `OPT-01`（修復單場 CSV `ByteString` 500 崩潰與 CSV 注入跳脫）
   - 完成 `OPT-03`（`page.tsx` 動態渲染、`store.ts` 原子寫入與單次寫入合併、提交數值驗證）
   - 完成 `OPT-02`（移除公開首頁 `/ops` 連結、保護刪除／營運／AI 辨識端點，保留 `/live` 與 `/present` 免登入）
2. **第二階段（P1 課堂體驗、路由修正與 AI 穩定度，預估 1 天）**：
   - 完成 `OPT-05`（修復雙重 `basePath`、Open Redirect、`303` 登出、HMAC + 登入限流與動態 `Secure` Cookie）
   - 完成 `OPT-04`（儲存後清空組別、載入既有組別防誤覆蓋、修正 T 卷「最不易執行」語意與紅綠計數提示）
   - 完成 `OPT-06` 與 `OPT-07`（上游 LLM 逾時／非 JSON 防護、`responseSchema`、前端取消辨識與輪詢韌性）
3. **第三階段（P2 效能、部署維運與測試固本，預估 0.5 天）**：
   - 完成 `OPT-08`、`OPT-09`、`OPT-10`（單次讀檔快照、後台中文說明、`.dockerignore`、零停機建置切換、`next/font` 與 `node:test` 單元測試）。
