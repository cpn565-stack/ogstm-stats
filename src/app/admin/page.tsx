import { AdminSessionTable } from "@/components/AdminSessionTable";
import { HistoricalStatsTable } from "@/components/HistoricalStatsTable";
import { buildHistoryOverview } from "@/lib/history";
import Link from "next/link";

export default function AdminPage() {
  const overview = buildHistoryOverview();

  return (
    <main className="space-y-10">
      <header className="space-y-2">
        <Link
          href="/"
          className="text-sm text-slate-400 transition hover:text-slate-200"
        >
          ← 返回課程操作
        </Link>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">
          後台統計
        </p>
        <h1 className="text-3xl font-bold text-slate-50">歷史資料管理</h1>
        <p className="max-w-2xl text-slate-400">
          所有場次課程的各組選項資料會永久保留在伺服器，可在此查詢單場次明細與跨場次歷史統計。
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">累計場次</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">
            {overview.totalSessions}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">累計組別紀錄</p>
          <p className="mt-1 text-3xl font-bold">{overview.totalSubmissions}</p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">匯出</p>
          <a
            href="/api/export/all"
            className="mt-2 inline-block cursor-pointer text-emerald-400 transition hover:text-emerald-300"
          >
            下載全部歷史 CSV →
          </a>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100">各場次紀錄</h2>
        <AdminSessionTable sessions={overview.sessions} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100">
          跨場次歷史統計
        </h2>
        <p className="text-sm text-slate-400">
          加總所有場次中，各題各選項的贊成與反對票數。
        </p>
        <HistoricalStatsTable rows={overview.historicalOptions} />
      </section>
    </main>
  );
}