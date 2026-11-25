import { GoogleAuth, Impersonated } from "google-auth-library";
import os from "node:os";
import path from "node:path";

const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let cachedAuth: GoogleAuth | null = null;

export function resetVertexAuthCache(): void {
  cachedAuth = null;
}

async function ensureAdcFromEnv() {
  const inlineJson = process.env.GOOGLE_ADC_JSON?.trim();
  if (!inlineJson) return;

  const fs = await import("node:fs");
  const targetPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    path.join(os.tmpdir(), "ogstm-gcp-adc.json");

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = targetPath;
  }

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, inlineJson, { mode: 0o600 });
  }
}

async function getGoogleAuth() {
  if (!cachedAuth) {
    await ensureAdcFromEnv();
    cachedAuth = new GoogleAuth({
      scopes: [CLOUD_PLATFORM_SCOPE],
    });
  }
  return cachedAuth;
}

async function getTokenFromGcloudCli(): Promise<string | null> {
  if (process.env.GOOGLE_USE_GCLOUD_CLI !== "1") {
    return null;
  }

  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("gcloud", [
      "auth",
      "print-access-token",
    ]);
    const token = stdout.trim();
    return token || null;
  } catch {
    return null;
  }
}

export async function getVertexAccessToken(): Promise<string> {
  const cliToken = await getTokenFromGcloudCli();
  if (cliToken) {
    return cliToken;
  }

  const impersonateAccount =
    process.env.GOOGLE_IMPERSONATE_SERVICE_ACCOUNT?.trim();

  try {
    if (impersonateAccount) {
      const sourceAuth = await getGoogleAuth();
      const sourceClient = await sourceAuth.getClient();
      const impersonated = new Impersonated({
        sourceClient,
        targetPrincipal: impersonateAccount,
        targetScopes: [CLOUD_PLATFORM_SCOPE],
        lifetime: 3600,
      });
      const token = await impersonated.getAccessToken();
      if (!token.token) {
        cachedAuth = null;
        throw new Error("無法取得 Vertex AI 存取權杖（模擬服務帳號失敗）");
      }
      return token.token;
    }

    const auth = await getGoogleAuth();
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) {
      cachedAuth = null;
      throw new Error(
        "未設定 Google OAuth 憑證。請執行 npm run setup:vertex-oauth 或設定 GOOGLE_ADC_JSON",
      );
    }
    return token.token;
  } catch (error) {
    cachedAuth = null;
    const rawMessage = error instanceof Error ? error.message : String(error);
    const lower = rawMessage.toLowerCase();
    if (lower.includes("invalid_grant") || lower.includes("reauth")) {
      throw new Error(
        "Vertex AI OAuth 憑證已過期，請通知管理員更新憑證，課堂請先改選 Nemotron VL 或手動輸入",
      );
    }
    if (
      lower.includes("could not load the default credentials") ||
      lower.includes("enoent")
    ) {
      throw new Error(
        "伺服器尚未備妥 Vertex AI 憑證，請改選 Nemotron VL 或直接手動勾選",
      );
    }
    throw error instanceof Error ? error : new Error(rawMessage);
  }
}
