import { apiPath } from "@/lib/paths";
import Link from "next/link";

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
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/ops"
            className="text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← 返回營運
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-50">{sessionName}</h1>
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