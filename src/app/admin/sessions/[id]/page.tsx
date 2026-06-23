import { GroupSubmissionTable } from "@/components/GroupSubmissionTable";
import { StatsTable } from "@/components/StatsTable";
import { getSessionStats } from "@/lib/history";
import Link from "next/link";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminSessionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const stats = getSessionStats(id);
  if (!stats) redirect("/admin");

  return (
    <main className="space-y-10">
      <header className="space-y-2">
        <Link
          href="/admin"
          className="text-sm text-slate-400 transition hover:text-slate-200"
        >
          ← 返回後台
        </Link>
        <h1 className="text-3xl font-bold text-slate-50">
          {stats.session.name}
        </h1>
        <p className="text-slate-400">
          建立於 {new Date(stats.session.createdAt).toLocaleString("zh-TW")}
          {" · "}
          {stats.completedGroups} 組已登錄
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href={`/session/${id}`}
            className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm transition hover:bg-slate-800"
          >
            進入課程操作
          </Link>
          <Link
            href={`/session/${id}/present`}
            className="cursor-pointer rounded-lg border border-emerald-500/40 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10"
          >
            講師視圖
          </Link>
          <a
            href={`/api/export/${id}`}
            className="cursor-pointer rounded-lg border border-slate-600 px-4 py-2 text-sm transition hover:bg-slate-800"
          >
            匯出 CSV
          </a>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100">場次加總</h2>
        <StatsTable
          questions={stats.questions}
          submissions={stats.submissions}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-100">
          各組選項明細
        </h2>
        <p className="text-sm text-slate-400">
          每一列為一個小組，記錄該組在各題各選項的紅勾與綠勾人數。
        </p>
        <GroupSubmissionTable stats={stats} />
      </section>
    </main>
  );
}