#!/usr/bin/env bash
# 一鍵部署到 VPS：備份 store.json → git pull → npm ci → build → pm2 restart
# 用法：npm run deploy
# 可用環境變數覆寫：DEPLOY_HOST、DEPLOY_USER、DEPLOY_DIR、PM2_NAME
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-165.232.161.37}"
DEPLOY_SSH_USER="${DEPLOY_SSH_USER:-root}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/deploy/ogstm-stats}"
PM2_NAME="${PM2_NAME:-ogstm-stats}"
BACKUP_DIR="${BACKUP_DIR:-/home/deploy/ogstm-backups}"
BRANCH="${BRANCH:-main}"

echo "▶ 部署到 ${DEPLOY_SSH_USER}@${DEPLOY_HOST}:${DEPLOY_DIR}（分支 ${BRANCH}）"

ssh "${DEPLOY_SSH_USER}@${DEPLOY_HOST}" "sudo -u ${DEPLOY_USER} bash -lc '
  set -euo pipefail
  cd \"${DEPLOY_DIR}\"
  mkdir -p \"${BACKUP_DIR}\"
  if [ -f data/store.json ]; then
    cp data/store.json \"${BACKUP_DIR}/store-deploy-\$(date +%F-%H%M%S).json\"
    echo \"  ✓ 已備份 store.json\"
  fi
  git fetch origin
  git checkout ${BRANCH}
  git reset --hard origin/${BRANCH}
  npm ci
  npm run build
  pm2 restart ${PM2_NAME}
  echo \"  ✓ 部署完成\"
'"

echo "▶ 完成。可開 https://ogstm.spq.tw 驗證"
