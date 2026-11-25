import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { POST as adminLoginPost } from "@/app/api/admin/login/route";
import { POST as adminLogoutPost } from "@/app/api/admin/logout/route";
import { GET as exportSessionGet } from "@/app/api/export/[id]/route";
import { GET as exportAllGet } from "@/app/api/export/all/route";
import { GET as historyGet } from "@/app/api/history/route";
import { POST as opsLoginPost } from "@/app/api/ops/login/route";
import { POST as opsLogoutPost } from "@/app/api/ops/logout/route";
import { GET as publicStatsGet } from "@/app/api/public/stats/route";
import { POST as recognizeOpenRouterPost } from "@/app/api/recognize/openrouter/route";
import { POST as recognizePost } from "@/app/api/recognize/route";
import {
  DELETE as sessionDelete,
  GET as sessionDetailGet,
  PATCH as sessionPatch,
} from "@/app/api/sessions/[id]/route";
import {
  DELETE as submissionGroupDelete,
  GET as submissionGroupGet,
} from "@/app/api/sessions/[id]/submissions/[groupId]/route";
import {
  GET as submissionsListGet,
  POST as submissionsPost,
} from "@/app/api/sessions/[id]/submissions/route";
import {
  GET as sessionsListGet,
  POST as sessionsCreatePost,
} from "@/app/api/sessions/route";
import {
  ADMIN_COOKIE,
  OPS_COOKIE,
  getAdminToken,
  getEffectiveOpsPassword,
  getOpsToken,
  resolveCookiePath,
  resolveCookieSecure,
  signRoleToken,
  verifyPasswordConstantTime,
} from "@/lib/auth";
import {
  buildCsvHeaders,
  encodeRfc5987Value,
  escapeCsvCell,
  formatCsvRow,
  sanitizeUtf8FilenameStem,
  serializeCsvWithBom,
} from "@/lib/csv";
import { sanitizeNextPath } from "@/lib/paths";
import {
  checkLoginRateLimit,
  clearAllLoginRateLimitsForTest,
  recordLoginFailure,
  resetLoginRateLimit,
} from "@/lib/rate-limit";
import {
  MAX_IMAGE_BYTES,
  parseAndValidateRecognizeRequest,
} from "@/lib/recognize-guard";
import {
  createSession,
  deleteSession,
  deleteSubmission,
  listSessions,
  resolveStorePaths,
  upsertSubmission,
} from "@/lib/store";
import { getTemplate, sanitizeSubmissionVotes } from "@/lib/template";

interface MockCookieEntry {
  value: string;
  options?: Record<string, unknown>;
}

type MockCookieJar = Map<string, MockCookieEntry> & {
  lastSetHistory?: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }>;
};

const globalWithCookies = globalThis as typeof globalThis & {
  __OGSTM_MOCK_COOKIES?: MockCookieJar;
};

let tempDir = "";
const envBackup: Record<string, string | undefined> = {};

const ENV_KEYS = [
  "OGSTM_DATA_DIR",
  "ADMIN_PASSWORD",
  "OPS_PASSWORD",
  "ADMIN_SESSION_SECRET",
  "COOKIE_SECURE",
  "NEXT_PUBLIC_BASE_PATH",
  "NEXT_PUBLIC_SITE_URL",
] as const;

function createCookieJar(): MockCookieJar {
  const jar = new Map<string, MockCookieEntry>() as MockCookieJar;
  jar.lastSetHistory = [];
  return jar;
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    envBackup[key] = process.env[key];
  }
  tempDir = mkdtempSync(path.join(os.tmpdir(), "ogstm-p0-test-"));
  process.env.OGSTM_DATA_DIR = tempDir;
  process.env.ADMIN_PASSWORD = "test-admin-pass-mock";
  process.env.OPS_PASSWORD = "test-ops-pass-mock";
  process.env.ADMIN_SESSION_SECRET = "test-hmac-secret-at-least-32-chars-mock";
  delete process.env.COOKIE_SECURE;
  process.env.NEXT_PUBLIC_BASE_PATH = "";
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

  clearAllLoginRateLimitsForTest();
  globalWithCookies.__OGSTM_MOCK_COOKIES = createCookieJar();
});

afterEach(() => {
  clearAllLoginRateLimitsForTest();
  delete globalWithCookies.__OGSTM_MOCK_COOKIES;
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  for (const key of ENV_KEYS) {
    if (envBackup[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = envBackup[key];
    }
  }
});

describe("FIX-01: CSV ByteString safety, RFC 5987 filename*, and formula injection defense", () => {
  it("FIX01-CASE-01: exports Chinese session name CSV with HTTP 200 and pure ASCII headers", async () => {
    globalWithCookies.__OGSTM_MOCK_COOKIES?.set(OPS_COOKIE, {
      value: getOpsToken(),
    });

    const session = createSession(
      "課程 2026/11/25 下午2:00:00",
      getTemplate().id,
    );
    upsertSubmission({
      sessionId: session.id,
      groupId: "1",
      votes: { vote_1: { a: { green: 1, red: 0 } } },
      source: "photo",
      confidence: 0.92,
    });

    const response = await exportSessionGet(
      new Request(`http://localhost:3000/api/export/${session.id}`),
      { params: Promise.resolve({ id: session.id }) },
    );

    assert.equal(response.status, 200);
    const cd = response.headers.get("content-disposition") ?? "";
    assert.match(cd, /^attachment; filename="session_[A-Za-z0-9_-]+_stats\.csv"; filename\*=UTF-8''/);
    assert.ok(cd.includes("%E8%AA%B2%E7%A8%8B"));

    // Every header value character must be printable ASCII 0x20..0x7E
    for (const [, val] of response.headers.entries()) {
      for (let i = 0; i < val.length; i += 1) {
        const code = val.charCodeAt(i);
        assert.ok(code >= 0x20 && code <= 0x7e, `Non-ASCII char code ${code}`);
      }
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes[0], 0xef);
    assert.equal(bytes[1], 0xbb);
    assert.equal(bytes[2], 0xbf);

    const text = new TextDecoder("utf-8").decode(bytes);
    assert.ok(text.includes("\r\n"));
  });

  it("FIX01-CASE-02..06: escapes commas/quotes/newlines, neutralizes formulas, and handles RFC 5987 edge cases", () => {
    assert.equal(
      escapeCsvCell('企業班 "A, B"\n梯次'),
      '"企業班 ""A, B""\n梯次"',
    );
    assert.equal(escapeCsvCell("=1+1"), "'=1+1");
    assert.equal(escapeCsvCell("+SUM(A1)"), "'+SUM(A1)");
    assert.equal(escapeCsvCell("-2+3"), "'-2+3");
    assert.equal(escapeCsvCell("@HYPERLINK()"), "'@HYPERLINK()");
    assert.equal(escapeCsvCell("\t=cmd"), "'\t=cmd");
    assert.equal(
      escapeCsvCell('  =CMD|"/C calc"!A0,test'),
      '"\'  =CMD|""/C calc""!A0,test"',
    );
    assert.equal(escapeCsvCell(0), "0");
    assert.equal(escapeCsvCell(1), "1");
    assert.equal(escapeCsvCell(Number.NaN), "");

    const encoded = encodeRfc5987Value("O'Reilly * 2026 (Q4)_stats.csv");
    assert.ok(encoded.includes("%27"));
    assert.ok(encoded.includes("%2A"));
    assert.ok(encoded.includes("%28"));
    assert.ok(encoded.includes("%29"));

    const headers = buildCsvHeaders(
      "中文_bad_name.csv",
      `${sanitizeUtf8FilenameStem("中".repeat(100), "session_fallback")}_stats.csv`,
    );
    // Construct Web Headers directly to guarantee zero undici ByteString errors
    const webHeaders = new Headers(headers);
    assert.equal(webHeaders.get("cache-control"), "private, no-store");
    assert.equal(webHeaders.get("x-content-type-options"), "nosniff");

    assert.equal(sanitizeUtf8FilenameStem("///", "session_12345678"), "session_12345678");
    assert.equal(Array.from(sanitizeUtf8FilenameStem("課".repeat(100), "fb")).length, 60);

    const csv = serializeCsvWithBom([formatCsvRow(["a", "b"]), formatCsvRow([1, 2])]);
    assert.equal(csv, "\uFEFFa,b\r\n1,2");
  });

  it("FIX01-CASE-07..08: enforces 401 unauthenticated and 403 ops boundary on /api/export/all", async () => {
    const session = createSession("測試匯出權限", getTemplate().id);

    const unauthSingle = await exportSessionGet(
      new Request(`http://localhost:3000/api/export/${session.id}`),
      { params: Promise.resolve({ id: session.id }) },
    );
    assert.equal(unauthSingle.status, 401);

    const unauthAll = await exportAllGet(
      new Request("http://localhost:3000/api/export/all"),
    );
    assert.equal(unauthAll.status, 401);

    globalWithCookies.__OGSTM_MOCK_COOKIES?.set(OPS_COOKIE, {
      value: getOpsToken(),
    });
    const opsSingle = await exportSessionGet(
      new Request(`http://localhost:3000/api/export/${session.id}`),
      { params: Promise.resolve({ id: session.id }) },
    );
    assert.equal(opsSingle.status, 200);

    const opsAll = await exportAllGet(
      new Request("http://localhost:3000/api/export/all"),
    );
    assert.equal(opsAll.status, 403);

    globalWithCookies.__OGSTM_MOCK_COOKIES?.set(ADMIN_COOKIE, {
      value: getAdminToken(),
    });
    const adminAll = await exportAllGet(
      new Request("http://localhost:3000/api/export/all"),
    );
    assert.equal(adminAll.status, 200);
  });
});

describe("FIX-02: Auth matrix, isomorphic sanitizeNextPath, redaction, rate limit, CSRF, and recognize guard", () => {
  it("FIX02-CASE-01 & isomorphic paths: paths.ts has no server-only imports and blocks Open Redirects", () => {
    const pathsSource = readFileSync(
      path.resolve(process.cwd(), "src/lib/paths.ts"),
      "utf-8",
    );
    assert.ok(!pathsSource.includes("next/headers"));
    assert.ok(!pathsSource.includes("crypto"));

    const homeSource = readFileSync(
      path.resolve(process.cwd(), "src/components/PublicStatsHome.tsx"),
      "utf-8",
    );
    assert.ok(!homeSource.includes('href="/ops"'));

    assert.equal(sanitizeNextPath("//evil.com", "/ops"), "/ops");
    assert.equal(sanitizeNextPath("/\\evil.com", "/ops"), "/ops");
    assert.equal(sanitizeNextPath("https://evil.com", "/admin"), "/admin");
    assert.equal(sanitizeNextPath("/ops/login", "/ops"), "/ops");
    assert.equal(sanitizeNextPath("/admin/login?next=/admin", "/admin"), "/admin");
    assert.equal(
      sanitizeNextPath("/session/abc/manual", "/ops"),
      "/session/abc/manual",
    );

    process.env.NEXT_PUBLIC_BASE_PATH = "/stats";
    assert.equal(sanitizeNextPath("/stats//evil.com", "/ops"), "/ops");
    assert.equal(
      sanitizeNextPath("/stats/session/123/manual", "/ops"),
      "/session/123/manual",
    );
    assert.equal(resolveCookiePath(), "/stats");
  });

  it("FIX02-CASE-02..03: blocks unauthenticated mutating/listing APIs while keeping GET /api/sessions/[id] public & redacted", async () => {
    const session = createSession("講師投影測試", getTemplate().id);
    upsertSubmission({
      sessionId: session.id,
      groupId: "2",
      votes: { vote_1: { a: { green: 1, red: 0 } } },
      source: "photo",
      confidence: 0.85,
      photoPath: "/tmp/secret.jpg",
    });

    assert.equal(
      (await sessionsListGet(new Request("http://localhost:3000/api/sessions"))).status,
      401,
    );
    assert.equal(
      (
        await sessionsCreatePost(
          new Request("http://localhost:3000/api/sessions", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await sessionPatch(
          new Request(`http://localhost:3000/api/sessions/${session.id}`, {
            method: "PATCH",
            body: JSON.stringify({ name: "hacked" }),
          }),
          { params: Promise.resolve({ id: session.id }) },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await sessionDelete(
          new Request(`http://localhost:3000/api/sessions/${session.id}`, {
            method: "DELETE",
          }),
          { params: Promise.resolve({ id: session.id }) },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await submissionsListGet(
          new Request(`http://localhost:3000/api/sessions/${session.id}/submissions`),
          { params: Promise.resolve({ id: session.id }) },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await submissionsPost(
          new Request(`http://localhost:3000/api/sessions/${session.id}/submissions`, {
            method: "POST",
            body: JSON.stringify({
              groupId: "9",
              votes: { vote_1: { a: { green: 1, red: 0 } } },
            }),
          }),
          { params: Promise.resolve({ id: session.id }) },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await submissionGroupGet(
          new Request(
            `http://localhost:3000/api/sessions/${session.id}/submissions/2`,
          ),
          { params: Promise.resolve({ id: session.id, groupId: "2" }) },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await submissionGroupDelete(
          new Request(
            `http://localhost:3000/api/sessions/${session.id}/submissions/2`,
            { method: "DELETE" },
          ),
          { params: Promise.resolve({ id: session.id, groupId: "2" }) },
        )
      ).status,
      401,
    );
    assert.equal(
      (await historyGet(new Request("http://localhost:3000/api/history"))).status,
      401,
    );

    // Public stats and trainer UUID polling remain 200 without cookies
    const pubStatsRes = await publicStatsGet();
    assert.equal(pubStatsRes.status, 200);

    const trainerRes = await sessionDetailGet(
      new Request(`http://localhost:3000/api/sessions/${session.id}`),
      { params: Promise.resolve({ id: session.id }) },
    );
    assert.equal(trainerRes.status, 200);
    assert.equal(trainerRes.headers.get("cache-control"), "no-store");
    const trainerJson = (await trainerRes.json()) as {
      completedGroups: number;
      questions: Array<{ options: Array<{ option: string; green: number }> }>;
      submissions: Array<{
        groupId: string;
        votes: Record<string, unknown>;
        confidence?: number;
        photoPath?: string;
      }>;
    };
    assert.equal(trainerJson.completedGroups, 1);
    assert.equal(trainerJson.questions[0]?.options[0]?.green, 1);
    assert.deepEqual(trainerJson.submissions[0]?.votes, {});
    assert.equal(trainerJson.submissions[0]?.photoPath, undefined);
    assert.equal(trainerJson.submissions[0]?.confidence, 0.85);

    // Authenticated ops receives unredacted votes
    globalWithCookies.__OGSTM_MOCK_COOKIES?.set(OPS_COOKIE, {
      value: getOpsToken(),
    });
    const authedRes = await sessionDetailGet(
      new Request(`http://localhost:3000/api/sessions/${session.id}`),
      { params: Promise.resolve({ id: session.id }) },
    );
    const authedJson = (await authedRes.json()) as {
      submissions: Array<{ votes: Record<string, unknown> }>;
    };
    assert.ok(Object.keys(authedJson.submissions[0]?.votes ?? {}).length > 0);
  });

  it("FIX02-CASE-05..07 & 10..12: OPS_PASSWORD fallback, role separation, HTTP IP vs HTTPS Secure cookie, 303 logout, CSRF, and rate limit", async () => {
    delete process.env.OPS_PASSWORD;
    assert.equal(getEffectiveOpsPassword(), "test-admin-pass-mock");

    // Plain HTTP IP login -> Secure must be false
    const httpLoginRes = await opsLoginPost(
      new Request("http://165.232.161.37/api/ops/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://165.232.161.37",
          Host: "165.232.161.37",
        },
        body: JSON.stringify({ password: "test-admin-pass-mock" }),
      }),
    );
    assert.equal(httpLoginRes.status, 200);
    const lastSetHttp =
      globalWithCookies.__OGSTM_MOCK_COOKIES?.lastSetHistory?.at(-1);
    assert.equal(lastSetHttp?.options?.secure, false);

    // HTTPS reverse proxy -> Secure must be true
    assert.equal(
      resolveCookieSecure(
        new Request("http://127.0.0.1:3000/api/ops/login", {
          method: "POST",
          headers: { "X-Forwarded-Proto": "https" },
        }),
      ),
      true,
    );

    // Separate OPS_PASSWORD vs ADMIN_PASSWORD
    process.env.OPS_PASSWORD = "ta-only-mock-pass";
    assert.notEqual(
      signRoleToken("admin", "test-admin-pass-mock"),
      signRoleToken("ops", "test-admin-pass-mock"),
    );
    assert.equal(
      verifyPasswordConstantTime("ta-only-mock-pass", "ta-only-mock-pass"),
      true,
    );

    const taAdminLogin = await adminLoginPost(
      new Request("http://localhost:3000/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "ta-only-mock-pass" }),
      }),
    );
    assert.equal(taAdminLogin.status, 401);

    // Cross-site CSRF blocked with 403
    globalWithCookies.__OGSTM_MOCK_COOKIES?.set(OPS_COOKIE, {
      value: getOpsToken(),
    });
    const csrfBlocked = await sessionsCreatePost(
      new Request("http://localhost:3000/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
          Host: "localhost:3000",
        },
        body: "{}",
      }),
    );
    assert.equal(csrfBlocked.status, 403);

    // Logout clears both cookies and redirects 303
    globalWithCookies.__OGSTM_MOCK_COOKIES?.set(ADMIN_COOKIE, {
      value: getAdminToken(),
    });
    const logoutRes = await opsLogoutPost(
      new Request("http://165.232.161.37/api/ops/logout", {
        method: "POST",
        headers: { Host: "165.232.161.37", Origin: "http://165.232.161.37" },
      }),
    );
    assert.equal(logoutRes.status, 303);
    assert.equal(
      logoutRes.headers.get("location"),
      "http://165.232.161.37/ops/login",
    );
    assert.equal(globalWithCookies.__OGSTM_MOCK_COOKIES?.has(OPS_COOKIE), false);
    assert.equal(
      globalWithCookies.__OGSTM_MOCK_COOKIES?.has(ADMIN_COOKIE),
      false,
    );

    const adminLogoutRes = await adminLogoutPost(
      new Request("http://localhost:3000/api/admin/logout", {
        method: "POST",
      }),
    );
    assert.equal(adminLogoutRes.status, 303);

    // Rate limiting: 5 failures -> 6th blocked with 429
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      assert.equal(checkLoginRateLimit("ops:1.2.3.4", t0 + i * 100).allowed, true);
      recordLoginFailure("ops:1.2.3.4", t0 + i * 100);
    }
    const sixth = checkLoginRateLimit("ops:1.2.3.4", t0 + 1000);
    assert.equal(sixth.allowed, false);
    if (!sixth.allowed) {
      assert.ok(sixth.retryAfterSeconds > 0);
    }
    assert.equal(checkLoginRateLimit("ops:1.2.3.4", t0 + 61_000).allowed, true);
    resetLoginRateLimit("ops:1.2.3.4");
  });

  it("FIX02-CASE-13..14: /api/recognize* enforces auth first, 4MB limit (413), MIME whitelist (415), and questionId/Base64 validation (400)", async () => {
    const unauthRec = await recognizePost(
      new Request("http://localhost:3000/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(unauthRec.status, 401);

    const unauthOr = await recognizeOpenRouterPost(
      new Request("http://localhost:3000/api/recognize/openrouter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(unauthOr.status, 401);

    // Oversized > 4MB Base64 -> 413
    const hugeB64 = "A".repeat(Math.ceil(((MAX_IMAGE_BYTES + 1024) * 4) / 3 / 4) * 4);
    const overRes = await parseAndValidateRecognizeRequest(
      new Request("http://localhost:3000/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: "vote_1",
          mimeType: "image/jpeg",
          imageBase64: hugeB64,
        }),
      }),
    );
    assert.equal(overRes.ok, false);
    if (!overRes.ok) assert.equal(overRes.response.status, 413);

    // Unsupported MIME -> 415
    for (const badMime of ["application/pdf", "image/svg+xml"]) {
      const mimeRes = await parseAndValidateRecognizeRequest(
        new Request("http://localhost:3000/api/recognize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: "vote_1",
            mimeType: badMime,
            imageBase64: "QUJDRA==",
          }),
        }),
      );
      assert.equal(mimeRes.ok, false);
      if (!mimeRes.ok) assert.equal(mimeRes.response.status, 415);
    }

    // Invalid Base64 -> 400
    const badB64Res = await parseAndValidateRecognizeRequest(
      new Request("http://localhost:3000/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: "vote_1",
          mimeType: "image/png",
          imageBase64: "not-base64!!!",
        }),
      }),
    );
    assert.equal(badB64Res.ok, false);
    if (!badB64Res.ok) assert.equal(badB64Res.response.status, 400);

    // Unknown questionId -> 400
    const badQRes = await parseAndValidateRecognizeRequest(
      new Request("http://localhost:3000/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: "vote_999",
          mimeType: "image/webp",
          imageBase64: "QUJDRA==",
        }),
      }),
    );
    assert.equal(badQRes.ok, false);
    if (!badQRes.ok) assert.equal(badQRes.response.status, 400);

    // Valid JPEG -> ok: true
    const okRes = await parseAndValidateRecognizeRequest(
      new Request("http://localhost:3000/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: "vote_1",
          mimeType: "image/jpeg",
          imageBase64: "QUJDRA==",
        }),
      }),
    );
    assert.equal(okRes.ok, true);
  });
});

describe("FIX-03: Atomic store.json, .bak recovery, field preservation, and sanitizeSubmissionVotes", () => {
  it("FIX03-CASE-02..04: creates .bak on update, quarantines corrupt store.json and recovers from .bak or heals to empty", () => {
    const { dataDir, storePath, backupPath } = resolveStorePaths();
    const s1 = createSession("第一場", getTemplate().id);
    assert.equal(existsSync(storePath), true);

    upsertSubmission({
      sessionId: s1.id,
      groupId: "1",
      votes: { vote_1: { a: { green: 1, red: 0 } } },
      source: "manual",
    });
    assert.equal(existsSync(backupPath), true);
    const leftovers = readdirSync(dataDir).filter((f) => f.endsWith(".tmp"));
    assert.equal(leftovers.length, 0);

    // Truncate store.json to simulate power loss / crash
    writeFileSync(storePath, '{"sessions": [', "utf-8");
    const recoveredSessions = listSessions();
    assert.equal(recoveredSessions.length, 1);
    assert.equal(recoveredSessions[0]?.name, "第一場");
    const corruptFiles = readdirSync(dataDir).filter((f) =>
      f.startsWith("store.corrupt."),
    );
    assert.equal(corruptFiles.length, 1);

    // Corrupt primary AND remove .bak -> self-heals to empty store
    unlinkSync(backupPath);
    writeFileSync(storePath, "corrupt-unrecoverable", "utf-8");
    const healed = listSessions();
    assert.deepEqual(healed, []);
  });

  it("FIX03-CASE-05..06: preserves confidence/id/createdAt across G->T phases and skips disk write on 404 delete", async () => {
    const { storePath } = resolveStorePaths();
    const session = createSession("跨階段測試", getTemplate().id);

    const phase1 = upsertSubmission({
      sessionId: session.id,
      groupId: "3",
      votes: { vote_1: { a: { green: 1, red: 0 } } },
      source: "photo",
      confidence: 0.88,
      photoPath: "mem://photo1",
    });

    const phase2 = upsertSubmission({
      sessionId: session.id,
      groupId: "3",
      votes: { vote_2: { b: { green: 0, red: 1 } } },
      source: "manual",
      confidence: undefined,
      photoPath: undefined,
    });

    assert.equal(phase2.id, phase1.id);
    assert.equal(phase2.createdAt, phase1.createdAt);
    assert.equal(phase2.confidence, 0.88);
    assert.equal(phase2.photoPath, "mem://photo1");
    assert.deepEqual(phase2.votes.vote_1?.a, { green: 1, red: 0 });
    assert.deepEqual(phase2.votes.vote_2?.b, { green: 0, red: 1 });

    const mtimeBefore = statSync(storePath).mtimeMs;
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(deleteSubmission(session.id, "999"), false);
    assert.equal(deleteSession("non-existent-session"), false);
    assert.equal(statSync(storePath).mtimeMs, mtimeBefore);
  });

  it("FIX03-CASE-07..10: sanitizeSubmissionVotes & submissions POST reject malformed votes/JSON/groupId", async () => {
    const template = getTemplate();

    for (const bad of [
      null,
      [],
      {},
      { vote_99: { a: { green: 1, red: 0 } } },
      { vote_2: { k: { green: 1, red: 0 } } },
      { vote_1: { a: { green: "1", red: 0 } } },
      { vote_1: { a: { green: -1, red: 0 } } },
      { vote_1: { a: { green: 2, red: 0 } } },
      { vote_1: { a: { green: 0.5, red: 0 } } },
      { vote_1: { a: { green: true, red: 0 } } },
      { vote_1: { a: { green: 1 } } },
    ]) {
      assert.equal(sanitizeSubmissionVotes(template, bad).ok, false);
    }

    const valid = sanitizeSubmissionVotes(template, {
      vote_2: { a: { green: 1, red: -0 } },
    });
    assert.equal(valid.ok, true);
    if (valid.ok) {
      assert.equal(Object.is(valid.votes.vote_2?.a?.red, 0), true);
      assert.deepEqual(valid.votes.vote_2?.j, { green: 0, red: 0 });
    }

    globalWithCookies.__OGSTM_MOCK_COOKIES?.set(OPS_COOKIE, {
      value: getOpsToken(),
    });
    const session = createSession("API 驗證場次", template.id);

    const badJsonRes = await submissionsPost(
      new Request(
        `http://localhost:3000/api/sessions/${session.id}/submissions`,
        { method: "POST", body: "{bad-json" },
      ),
      { params: Promise.resolve({ id: session.id }) },
    );
    assert.equal(badJsonRes.status, 400);

    const nonStringGroupRes = await submissionsPost(
      new Request(
        `http://localhost:3000/api/sessions/${session.id}/submissions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: 12345,
            votes: { vote_1: { a: { green: 1, red: 0 } } },
          }),
        },
      ),
      { params: Promise.resolve({ id: session.id }) },
    );
    assert.equal(nonStringGroupRes.status, 400);
  });
});
