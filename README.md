# OGSTM Stats

課堂思考圖表決統計系統。部署位置待定，支援兩種方式：

- **子網域**：`https://stats.ogstm.com`
- **子路徑**：`https://ogstm.com/stats`

助教可在課程中透過**拍照 AI 辨識**或**手動勾選**，快速彙整各組思考圖上的 0/1 紅綠勾選（G 卷：綠＝最重要、紅＝最易忽略；T 卷：綠＝最重要、紅＝最不易執行），並即時查看跨組排行與統計。

## 功能

- **分層權限與免登入投影**：公開首頁 `/` 僅顯示跨場次加總；助教透過 `/ops/login` 進入營運區；團隊透過 `/admin/login` 管理全站與刪除；講師憑 `/session/[id]/present` 與 `/session/[id]/live` 免登入即時查看排行
- **課程 Session 管理**：建立課程、編輯名稱、查看歷史紀錄
- **手動輸入**：依模板逐項勾選各組綠／紅框（自動偵測既有組別防誤覆蓋）
- **拍照輸入**：拍攝思考圖由 Vertex AI Gemini / OpenRouter 預填勾選並經人工確認後儲存
- **即時彙整儀表板**：跨組加總、綠佔比視覺化
- **講師視圖**：大字體口述與即時投影介面，顯示各題前 5 名（含同票並列），支援斷網重試與背景暫停輪詢
- **後台歷史統計**：保留各場次各組選項明細，支援跨場次歷史加總與 RFC 5987 中文檔名 CSV 匯出
- **原子儲存與自動復原**：`data/store.json` 採同目錄暫存檔原子替換與 `.bak` 損毀自動復原

## 技術棧

- Next.js 16 (App Router)
- TypeScript + Tailwind CSS
- JSON 檔案儲存（`data/store.json`）

## 本地開發

```bash
cp .env.example .env.local
npm install
npm run dev
```

開啟 http://localhost:3000

## 部署方式選擇

| | `stats.ogstm.com` | `ogstm.com/stats` |
|---|---|---|
| DNS | 需新增 A/CNAME 記錄 | 不需額外 DNS |
| 與主站關係 | 獨立服務 | 可與 ogstm.com 共用伺服器 |
| Cookie / 登入 | 獨立網域 | 可與主站共用 |
| 設定 | `BASE_PATH` 留空 | `BASE_PATH=/stats` |
| 適合情境 | 獨立擴展、未來功能多 | 與主站同一台、設定簡單 |

複製 `.env.example` 為 `.env.local`（或部署環境變數），依選擇設定：

**方案 A — 子網域 `stats.ogstm.com`**

```env
NEXT_PUBLIC_SITE_URL=https://stats.ogstm.com
NEXT_PUBLIC_BASE_PATH=
```

**方案 B — 子路徑 `ogstm.com/stats`**

```env
NEXT_PUBLIC_SITE_URL=https://ogstm.com
NEXT_PUBLIC_BASE_PATH=/stats
```

> 變更 `NEXT_PUBLIC_BASE_PATH` 後需重新 `npm run build`。

### 建置與啟動

```bash
npm run build
npm run start
```

預設 port 3000，可設定 `PORT` 環境變數。

### Nginx 範例

**方案 A — 子網域**

```nginx
server {
    listen 443 ssl;
    server_name stats.ogstm.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**方案 B — 子路徑（與 ogstm.com 主站並存）**

```nginx
server {
    listen 443 ssl;
    server_name ogstm.com;

    # 主站（依你現有設定調整）
    location / {
        # root 或 proxy_pass 至主站
    }

    location /stats {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 注意事項

- `data/store.json` 為執行時資料，請確保部署環境有寫入權限
- 此專案使用檔案儲存，不適用無狀態 Serverless（如 Vercel 預設）除非改用外部資料庫

## 模板設定

編輯 `src/data/template.json`：

- `questions`：兩題表決與各題選項（a, b, c…）
- `rois`：各勾選框的相對座標 `[x, y, w, h]`（0–1），用於拍照自動辨識

提供空白思考圖模板後，可標定 ROI 啟用自動辨識。

## 資料保留

所有場次資料儲存在伺服器 `data/store.json`（部署時需確保此目錄可寫入且定期備份）。

| 路徑 | 用途 |
|------|------|
| `/admin` | 後台：各場次列表、跨場次歷史統計 |
| `/admin/sessions/{id}` | 單場次各組選項明細 |
| `/api/export/all` | 匯出全部歷史 CSV |

## 專案結構

```
src/
├── app/                  # 頁面與 API
├── components/           # UI 元件
├── data/template.json    # 思考圖模板設定
└── lib/                  # 儲存、彙整、辨識邏輯
```

## License

Private — OGSTM