"use client";

import { apiPath } from "@/lib/paths";
import Link from "next/link";
import { useRef, useState } from "react";

interface SessionHeaderProps {
  sessionId: string;
  sessionName: string;
  active?: "dashboard" | "manual" | "photo" | "present";
}

const tabs = [
  { key: "dashboard", label: "彙整", href: (id: string) => `/session/${id}` },
  {
    key: "present",
    label: "講師口述",
    href: (id: string) => `/session/${id}/present`,
  },
  {
    key: "manual",
    label: "手動輸入",
    href: (id: string) => `/session/${id}/manual`,
  },
  {
    key: "photo",
    label: "拍照輸入",
    href: (id: string) => `/session/${id}/photo`,
  },
] as const;

export function SessionHeader({
  sessionId,
  sessionName,
  active = "dashboard",
}: SessionHeaderProps) {
  const [name, setName] = useState(sessionName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const res = await fetch(apiPath(`/api/sessions/${sessionId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setSaving(false);
    if (res.ok) setName(trimmed);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void commitEdit();
    if (e.key === "Escape") setEditing(false);
  }

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href="/ops"
            className="text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← 返回營運
          </Link>
          <div className="mt-1 flex items-center gap-2">
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitEdit()}
                onKeyDown={handleKeyDown}
                disabled={saving}
                className="w-full max-w-md rounded-lg border border-emerald-500/60 bg-slate-900 px-3 py-1 text-2xl font-bold text-slate-50 outline-none ring-emerald-500/40 focus:ring-2"
                autoFocus
              />
            ) : (
              <>
                <h1 className="truncate text-2xl font-bold text-slate-50">
                  {name}
                </h1>
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="編輯課程名稱"
                  className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                >
                  ✎
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/sessions/${sessionId}`}
            className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            後台紀錄
          </Link>
          <a
            href={apiPath(`/api/export/${sessionId}`)}
            className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
          >
            匯出 CSV
          </a>
        </div>
      </div>

      <nav className="flex gap-2">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href(sessionId)}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
