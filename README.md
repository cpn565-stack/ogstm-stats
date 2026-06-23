# OGSTM Stats

課堂思考圖表決統計系統，部署於 [stats.ogstm.com](https://stats.ogstm.com)。

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
npm install
npm run dev
```

開啟 http://localhost:3000

## 模板設定

編輯 `src/data/template.json`：

- `questions`：兩題表決與各題選項（a, b, c…）
- `rois`：各勾選框的相對座標 `[x, y, w, h]`（0–1），用於拍照自動辨識

提供空白思考圖模板後，可標定 ROI 啟用自動辨識。

## 部署至 stats.ogstm.com

建議使用 Node.js 伺服器（需持久化 `data/` 目錄）。

### 建置與啟動

```bash
npm run build
npm run start
```

預設 port 3000，可設定 `PORT` 環境變數。

### 反向代理（Nginx 範例）

```nginx
server {
    listen 443 ssl;
    server_name stats.ogstm.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 注意事項

- `data/store.json` 為執行時資料，請確保部署環境有寫入權限
- 此專案使用檔案儲存，不適用無狀態 Serverless（如 Vercel 預設）除非改用外部資料庫

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