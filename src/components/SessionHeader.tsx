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
    label: "拍照",
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

  const isMobileFlow = active === "manual" || active === "present";

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
    <header className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href="/ops"
            className="inline-flex min-h-10 items-center text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← 營運
          </Link>
          <div className="mt-0.5 flex items-center gap-2">
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => void commitEdit()}
                onKeyDown={handleKeyDown}
                disabled={saving}
                className="w-full rounded-xl border border-emerald-500/60 bg-slate-900 px-3 py-2 text-xl font-bold text-slate-50 outline-none ring-emerald-500/40 focus:ring-2 sm:text-2xl"
                autoFocus
              />
            ) : (
              <>
                <h1 className="truncate text-xl font-bold text-slate-50 sm:text-2xl">
                  {name}
                </h1>
                <button
                  type="button"
                  onClick={startEdit}
                  aria-label="編輯課程名稱"
                  className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-800 hover:text-slate-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="size-4"
                    aria-hidden
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        {!isMobileFlow && (
          <div className="hidden gap-2 sm:flex">
            <Link
              href={`/admin/sessions/${sessionId}`}
              className="cursor-pointer rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              後台
            </Link>
            <a
              href={apiPath(`/api/export/${sessionId}`)}
              className="cursor-pointer rounded-xl border border-slate-600 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
            >
              CSV
            </a>
          </div>
        )}
      </div>

      <nav className="-mx-1 flex gap-2 overflow-x-auto overscroll-x-contain pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={tab.href(sessionId)}
              className={`shrink-0 cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold transition duration-200 active:scale-[0.98] ${
                isActive
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-800 text-slate-300 active:bg-slate-700"
              } ${isMobileFlow ? "min-h-11" : ""}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}