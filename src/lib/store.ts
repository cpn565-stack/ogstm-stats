import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { mergeSubmissionVotes } from "./template";
import type { Session, Submission, SubmissionVotes } from "./types";

interface StoreData {
  sessions: Session[];
  submissions: Submission[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureStore(): StoreData {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!existsSync(STORE_PATH)) {
    const initial: StoreData = { sessions: [], submissions: [] };
    writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf-8");
    return initial;
  }

  return JSON.parse(readFileSync(STORE_PATH, "utf-8")) as StoreData;
}

function writeStore(data: StoreData) {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function listSessions(): Session[] {
  const store = ensureStore();
  return store.sessions.sort(
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

export function deleteSession(id: string): boolean {
  const store = ensureStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((session) => session.id !== id);
  store.submissions = store.submissions.filter(
    (submission) => submission.sessionId !== id,
  );
  writeStore(store);
  return store.sessions.length < before;
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
    const existing = store.submissions[existingIndex];
    const mergedVotes: SubmissionVotes = mergeSubmissionVotes(
      existing.votes,
      input.votes,
    );
    const updated: Submission = {
      ...existing,
      ...input,
      votes: mergedVotes,
      updatedAt: now,
    };
    store.submissions[existingIndex] = updated;
    writeStore(store);
    touchSession(input.sessionId);
    return updated;
  }

  const created: Submission = {
    id: input.id ?? randomUUID(),
    sessionId: input.sessionId,
    groupId: input.groupId,
    votes: input.votes,
    source: input.source,
    confidence: input.confidence,
    photoPath: input.photoPath,
    createdAt: now,
    updatedAt: now,
  };
  store.submissions.push(created);
  writeStore(store);
  touchSession(input.sessionId);
  return created;
}

export function deleteSubmission(sessionId: string, groupId: string): boolean {
  const store = ensureStore();
  const before = store.submissions.length;
  store.submissions = store.submissions.filter(
    (submission) =>
      !(submission.sessionId === sessionId && submission.groupId === groupId),
  );
  writeStore(store);
  if (store.submissions.length < before) {
    touchSession(sessionId);
    return true;
  }
  return false;
}

function touchSession(sessionId: string) {
  const store = ensureStore();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (session) {
    session.updatedAt = new Date().toISOString();
    writeStore(store);
  }
}