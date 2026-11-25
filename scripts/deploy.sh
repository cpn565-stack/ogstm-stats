#!/usr/bin/env bash
# 一鍵部署到 VPS：備份 store.json（保留最新 30 份）→ git pull → npm ci → test & build → 驗證 BUILD_ID → pm2 restart
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
    BACKUP_FILE=\"${BACKUP_DIR}/store-deploy-\$(date +%F-%H%M%S).json\"
    cp data/store.json \"\${BACKUP_FILE}\"
    echo \"  ✓ 已備份 store.json -> \${BACKUP_FILE}\"
    ls -1t \"${BACKUP_DIR}\"/store-deploy-*.json 2>/dev/null | tail -n +31 | while IFS= read -r old_bak; do
      rm -f -- \"\${old_bak}\"
    done
  fi
  git fetch origin
  git checkout ${BRANCH}
  git reset --hard origin/${BRANCH}
  npm ci
  npm test
  npm run build
  test -f .next/BUILD_ID
  pm2 restart ${PM2_NAME} --update-env
  echo \"  ✓ 部署完成\"
'"

echo "▶ 完成。可開 https://ogstm.spq.tw 驗證"
