import { randomUUID } from "crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { mergeSubmissionVotes } from "./template";
import type { Session, Submission, SubmissionVotes } from "./types";

export interface StoreData {
  sessions: Session[];
  submissions: Submission[];
}

export function resolveStorePaths() {
  const customDir = process.env.OGSTM_DATA_DIR?.trim();
  const dataDir = customDir
    ? path.resolve(customDir)
    : path.join(process.cwd(), "data");
  const storePath = path.join(dataDir, "store.json");
  const backupPath = `${storePath}.bak`;
  return { dataDir, storePath, backupPath };
}

function isValidStoreData(value: unknown): value is StoreData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.sessions) && Array.isArray(candidate.submissions)
  );
}

function tryReadValidStoreFile(filePath: string): StoreData | null {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isValidStoreData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function atomicWriteJsonFile(
  dataDir: string,
  targetPath: string,
  data: StoreData,
): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const tmpPath = path.join(
    dataDir,
    `.store.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`,
  );

  let fd: number | null = null;
  try {
    fd = openSync(tmpPath, "w", 0o600);
    writeFileSync(fd, payload, "utf-8");
    fsyncSync(fd);
    closeSync(fd);
    fd = null;

    renameSync(tmpPath, targetPath);

    try {
      const dirFd = openSync(dataDir, "r");
      try {
        fsyncSync(dirFd);
      } finally {
        closeSync(dirFd);
      }
    } catch {
      // 忽略部分作業系統或容器掛載點不支援目錄 fsync 之錯誤
    }
  } catch (error) {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // ignore
      }
    }
    if (existsSync(tmpPath)) {
      try {
        unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
    throw error;
  }
}

function writeStore(data: StoreData): void {
  const { dataDir, storePath, backupPath } = resolveStorePaths();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // 僅在既有 store.json 存在且結構合法時更新 .bak，絕不讓損毀檔覆蓋良善備份
  if (tryReadValidStoreFile(storePath) !== null) {
    try {
      copyFileSync(storePath, backupPath);
    } catch {
      // best-effort backup
    }
  }

  atomicWriteJsonFile(dataDir, storePath, data);
}

function ensureStore(): StoreData {
  const { dataDir, storePath, backupPath } = resolveStorePaths();
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(storePath)) {
    const fromBackup = tryReadValidStoreFile(backupPath);
    if (fromBackup) {
      console.warn("[store] store.json 不存在，已自動自 store.json.bak 還原");
      atomicWriteJsonFile(dataDir, storePath, fromBackup);
      return fromBackup;
    }
    const initial: StoreData = { sessions: [], submissions: [] };
    atomicWriteJsonFile(dataDir, storePath, initial);
    return initial;
  }

  const primary = tryReadValidStoreFile(storePath);
  if (primary) {
    return primary;
  }

  // 主檔損毀：先隔離證據，再嘗試由 .bak 復原
  const corruptPath = path.join(
    dataDir,
    `store.corrupt.${Date.now()}.${randomUUID().slice(0, 6)}.json`,
  );
  try {
    copyFileSync(storePath, corruptPath);
  } catch {
    // best-effort quarantine
  }

  const recovered = tryReadValidStoreFile(backupPath);
  if (recovered) {
    console.error(
      `[store] 偵測到 store.json 損毀（已隔離至 ${corruptPath}），已自 store.json.bak 自動復原`,
    );
    atomicWriteJsonFile(dataDir, storePath, recovered);
    return recovered;
  }

  console.error(
    `[store] 偵測到 store.json 損毀（已隔離至 ${corruptPath}）且無可用 .bak，已重建空白儲存`,
  );
  const empty: StoreData = { sessions: [], submissions: [] };
  atomicWriteJsonFile(dataDir, storePath, empty);
  return empty;
}

export function getStoreSnapshot(): StoreData {
  return ensureStore();
}

function touchSessionInMemory(
  store: StoreData,
  sessionId: string,
  nowIso: string,
): void {
  const session = store.sessions.find((item) => item.id === sessionId);
  if (session) {
    session.updatedAt = nowIso;
  }
}

export function listSessions(): Session[] {
  const store = ensureStore();
  return [...store.sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getSession(id: string): Session | undefined {
  return ensureStore().sessions.find((session) => session.id === id);
}

export function createSession(name: string, templateId: string): Session {
  const store = ensureStore();
  const now = new Date().toISOString();
  const session: Session = {
    id: randomUUID(),
    name,
    templateId,
    createdAt: now,
    updatedAt: now,
  };
  store.sessions.unshift(session);
  writeStore(store);
  return session;
}

export function updateSessionName(
  id: string,
  name: string,
): Session | undefined {
  const store = ensureStore();
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return undefined;
  session.name = name;
  session.updatedAt = new Date().toISOString();
  writeStore(store);
  return session;
}

export function deleteSession(id: string): boolean {
  const store = ensureStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((session) => session.id !== id);
  if (store.sessions.length === before) {
    return false;
  }
  store.submissions = store.submissions.filter(
    (submission) => submission.sessionId !== id,
  );
  writeStore(store);
  return true;
}

export function listSubmissions(sessionId: string): Submission[] {
  return ensureStore()
    .submissions.filter((submission) => submission.sessionId === sessionId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
}

export function getSubmission(
  sessionId: string,
  groupId: string,
): Submission | undefined {
  return ensureStore().submissions.find(
    (submission) =>
      submission.sessionId === sessionId && submission.groupId === groupId,
  );
}

export function upsertSubmission(
  input: Omit<Submission, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
  },
): Submission {
  const store = ensureStore();
  const now = new Date().toISOString();
  const existingIndex = store.submissions.findIndex(
    (submission) =>
      submission.sessionId === input.sessionId &&
      submission.groupId === input.groupId,
  );

  if (existingIndex >= 0) {
    const existing = store.submissions[existingIndex]!;
    const mergedVotes: SubmissionVotes = mergeSubmissionVotes(
      existing.votes,
      input.votes,
    );
    const nextConfidence =
      input.confidence !== undefined ? input.confidence : existing.confidence;
    const nextPhotoPath =
      input.photoPath !== undefined ? input.photoPath : existing.photoPath;

    const updated: Submission = {
      id: existing.id,
      sessionId: existing.sessionId,
      groupId: existing.groupId,
      votes: mergedVotes,
      source: input.source,
      ...(nextConfidence !== undefined ? { confidence: nextConfidence } : {}),
      ...(nextPhotoPath !== undefined ? { photoPath: nextPhotoPath } : {}),
      createdAt: existing.createdAt,
      updatedAt: now,
    };

    store.submissions[existingIndex] = updated;
    touchSessionInMemory(store, input.sessionId, now);
    writeStore(store);
    return updated;
  }

  const created: Submission = {
    id: input.id ?? randomUUID(),
    sessionId: input.sessionId,
    groupId: input.groupId,
    votes: input.votes,
    source: input.source,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.photoPath !== undefined ? { photoPath: input.photoPath } : {}),
    createdAt: now,
    updatedAt: now,
  };
  store.submissions.push(created);
  touchSessionInMemory(store, input.sessionId, now);
  writeStore(store);
  return created;
}

export function deleteSubmission(sessionId: string, groupId: string): boolean {
  const store = ensureStore();
  const before = store.submissions.length;
  store.submissions = store.submissions.filter(
    (submission) =>
      !(submission.sessionId === sessionId && submission.groupId === groupId),
  );
  if (store.submissions.length === before) {
    return false;
  }
  touchSessionInMemory(store, sessionId, new Date().toISOString());
  writeStore(store);
  return true;
}
