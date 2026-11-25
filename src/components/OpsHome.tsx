"use client";

import { readJsonResponse } from "@/lib/fetch-json";
import { apiPath } from "@/lib/paths";
import type { Session } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface OpsHomeProps {
  initialSessions?: Session[];
}

export function OpsHome({ initialSessions = [] }: OpsHomeProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [creating, setCreating] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function refreshSessions() {
    const response = await fetch(apiPath("/api/sessions"), {
      cache: "no-store",
    });
    if (response.status === 401) {
      router.push("/ops/login");
      router.refresh();
      return;
    }
    const data = await readJsonResponse<{
      sessions?: Session[];
      error?: string;
    }>(response);
    if (!response.ok) {
      setErrorMessage(data.error ?? "載入課程列表失敗");
      return;
    }
    setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    setErrorMessage("");
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setErrorMessage("");
    try {
      const response = await fetch(apiPath("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sessionName }),
      });

      if (response.status === 401) {
        router.push("/ops/login");
        router.refresh();
        return;
      }

      const data = await readJsonResponse<{
        session?: Session;
        error?: string;
      }>(response);

      if (!response.ok) {
        setErrorMessage(data.error ?? "建立課程失敗");
        return;
      }

      setSessionName("");
      await refreshSessions();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "網路異常，建立課程失敗",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← 返回公開統計
          </Link>
          <form action={apiPath("/api/ops/logout")} method="POST">
            <button
              type="submit"
              className="cursor-pointer text-sm text-slate-500 transition hover:text-slate-300"
            >
              登出營運
            </button>
          </form>
        </div>
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-400">
          課程營運
        </p>
        <h1 className="text-3xl font-bold text-slate-50 sm:text-4xl">
          思考圖表決輸入
        </h1>
        <p className="max-w-2xl text-slate-400">
          助教建立課程、手動或拍照輸入各組票數；講師可開啟口述視圖查看排行。
        </p>
      </header>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/50 p-5 sm:flex-row"
      >
        <input
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
          maxLength={120}
          placeholder="新課程名稱（可留空自動命名）"
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none ring-emerald-500/40 focus:ring-2"
        />
        <button
          type="submit"
          disabled={creating}
          className="cursor-pointer rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {creating ? "建立中…" : "開始新課程"}
        </button>
      </form>

      {errorMessage && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {errorMessage}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">
          進行中 / 歷史課程
        </h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400">尚無課程，請建立第一場課程。</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/session/${session.id}`}
                  className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-700/80 bg-slate-900/40 px-5 py-4 transition hover:border-emerald-500/40 hover:bg-slate-900/70"
                >
                  <div>
                    <p className="font-semibold text-slate-100">
                      {session.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      更新於 {new Date(session.updatedAt).toLocaleString("zh-TW")}
                    </p>
                  </div>
                  <span className="text-sm text-emerald-400">進入 →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-slate-600">
        團隊後台請至{" "}
        <Link href="/admin" className="text-slate-500 hover:text-slate-400">
          /admin
        </Link>
      </p>
    </main>
  );
}
