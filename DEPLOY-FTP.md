# ogstm.com/stats — FTP 部署指南

本專案是 **Next.js + Node.js**，需要伺服器能執行 `node`（僅 FTP 上傳靜態檔無法運作）。

## 重要說明

| 項目 | 說明 |
|------|------|
| FTP 用途 | 上傳建置後的檔案到主機 |
| 執行環境 | 主機需 **Node.js 20+**（SSH 或控制台啟動 `node server.js`） |
| 子路徑 | `https://ogstm.com/stats` → `NEXT_PUBLIC_BASE_PATH=/stats` |
| 資料 | `data/` 目錄需可寫入，請勿覆蓋既有 `store.json` |

若主機只有純靜態空間、無法跑 Node，需改用支援 Node 的 VPS，或請主機商開啟子目錄反向代理到 Node 服務。

---

## 1. 本機建置

```bash
cd ogstm-stats
npm ci

# 建立 .env.production.local（勿提交 git）
cat > .env.production.local << 'EOF'
NEXT_PUBLIC_SITE_URL=https://ogstm.com
NEXT_PUBLIC_BASE_PATH=/stats
NEXT_PUBLIC_MAIN_SITE_URL=https://ogstm.com
ADMIN_PASSWORD=你的強密碼
ADMIN_SESSION_SECRET=隨機長字串
EOF

npm run build
```

建置完成後，standalone 輸出在 `.next/standalone/`。

---

## 2. 打包上傳清單

建議上傳到主機目錄例如 `/var/www/ogstm-stats/`：

```
.next/standalone/     → 整包內容（含 server.js）
.next/static/         → 複製到 standalone/.next/static/
public/               → 複製到 standalone/public/
data/                 → 建立可寫入目錄（保留 store.json）
```

快速打包腳本：

```bash
npm run build
mkdir -p deploy
cp -r .next/standalone/* deploy/
mkdir -p deploy/.next/static deploy/public
cp -r .next/static/* deploy/.next/static/
cp -r public/* deploy/public/
mkdir -p deploy/data
touch deploy/data/.gitkeep
# 用 FTP 上傳 deploy/ 內所有檔案
```

---

## 3. 主機啟動

SSH 進入主機後：

```bash
cd /path/to/deploy
export PORT=3000
export NODE_ENV=production
export NEXT_PUBLIC_SITE_URL=https://ogstm.com
export NEXT_PUBLIC_BASE_PATH=/stats
export ADMIN_PASSWORD=你的強密碼
export ADMIN_SESSION_SECRET=隨機長字串
node server.js
```

建議用 **PM2** 常駐：

```bash
npm install -g pm2
pm2 start server.js --name ogstm-stats
pm2 save
```

---

## 4. Nginx（ogstm.com 子路徑）

在既有 `ogstm.com` server block 加入：

```nginx
location /stats {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

重載 Nginx：`sudo nginx -t && sudo systemctl reload nginx`

---

## 5. 驗證

| URL | 預期 |
|-----|------|
| `https://ogstm.com/stats` | 公開統計首頁 |
| `https://ogstm.com/stats/ops` | 助教營運（建立課程） |
| `https://ogstm.com/stats/admin/login` | 後台登入 |
| `https://ogstm.com/stats/api/public/stats` | 公開 JSON |

---

## 6. 更新流程

1. 本機 `npm run build` 重新打包
2. FTP 上傳變更的 `.next` 與 `public`（**不要刪除** `data/store.json`）
3. `pm2 restart ogstm-stats`

---

## 7. 備份

定期備份 `data/store.json`（課程與各組票數）。