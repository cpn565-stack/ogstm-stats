#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-ogstm-input}"
ADC_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/ogstm-application_default_credentials.json}"

echo "==> OGSTM Vertex AI OAuth 設定"
echo "專案: $PROJECT_ID"
echo ""

gcloud config set project "$PROJECT_ID"

echo "1) 請在瀏覽器完成 Google OAuth 授權..."
gcloud auth application-default login

mkdir -p "$(dirname "$ADC_PATH")"
cp "$HOME/.config/gcloud/application_default_credentials.json" "$ADC_PATH"
chmod 600 "$ADC_PATH"

echo ""
echo "OAuth 憑證已複製到: $ADC_PATH"
echo ""
echo "本機 .env.local 請加入："
echo "LLM_PROVIDER=vertex"
echo "GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
echo "GOOGLE_CLOUD_LOCATION=asia-southeast1"
echo "VERTEX_GEMINI_MODEL=gemini-3.5-flash"
echo "GOOGLE_APPLICATION_CREDENTIALS=$ADC_PATH"
echo ""
echo "部署到 VPS："
echo "scp $ADC_PATH root@165.232.161.37:/home/deploy/.gcp/adc.json"
echo "ssh root@165.232.161.37 \"mkdir -p /home/deploy/.gcp && chown deploy:deploy /home/deploy/.gcp/adc.json && chmod 600 /home/deploy/.gcp/adc.json\""