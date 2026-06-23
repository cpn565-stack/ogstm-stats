"use client";

import type { Session } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sessionName, setSessionName] = useState("");

  async function loadSessions() {
    const response = await fetch("/api/sessions");
    const data = (await response.json()) as { sessions: Session[] };
    setSessions(data.sessions);
    setLoading(false);
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sessionName }),
    });
    setCreating(false);

    if (response.ok) {
      setSessionName("");
      await loadSessions();
    }
  }

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-emerald-400">
          OGSTM Stats
        </p>
        <h1 className="text-3xl font-bold text-slate-50 sm:text-4xl">
          思考圖表決統計
        </h1>
        <p className="max-w-2xl text-slate-400">
          助教可透過拍照辨識或手動輸入，快速彙整各組思考圖上的紅勾與綠勾票數；講師可在講師視圖即時查看各題統計結果。
        </p>
      </header>

      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/50 p-5 sm:flex-row"
      >
        <input
          value={sessionName}
          onChange={(event) => setSessionName(event.target.value)}
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

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">進行中 / 歷史課程</h2>
        {loading ? (
          <p className="text-sm text-slate-400">載入中…</p>
        ) : sessions.length === 0 ? (
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
                    <p className="font-semibold text-slate-100">{session.name}</p>
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
    </main>
  );
}