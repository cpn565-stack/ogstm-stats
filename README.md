# OGSTM Stats

課堂思考圖表決統計系統。部署位置待定，支援兩種方式：

- **子網域**：`https://stats.ogstm.com`
- **子路徑**：`https://ogstm.com/stats`

助教可在課程中透過**拍照辨識**或**手動輸入**，快速彙整各組思考圖上的紅勾（反對）與綠勾（贊成）票數，並即時查看跨組統計。

## 功能

- **課程 Session 管理**：建立課程、查看歷史紀錄
- **手動輸入**：依模板逐項輸入各組紅／綠勾人數
- **拍照輸入**：上傳思考圖照片，自動辨識（需標定模板 ROI）並可人工修正
- **即時彙整儀表板**：跨組加總、贊成率視覺化
- **CSV 匯出**：課後分析用

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