import { CopyLiveLinkButton } from "@/components/CopyLiveLinkButton";
import { StatsTable } from "@/components/StatsTable";
import { SessionHeader } from "@/components/SessionHeader";
import { aggregateSubmissions } from "@/lib/aggregate";
import { getSession, listSubmissions } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import Link from "next/link";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionDashboardPage({ params }: PageProps) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) redirect("/ops");

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);

  return (
    <main className="space-y-8">
      <SessionHeader
        sessionId={id}
        sessionName={stats.session.name}
        active="dashboard"
      />

      <Link
        href={`/session/${id}/present`}
        className="flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 transition hover:bg-emerald-500/15"
      >
        <div>
          <p className="font-semibold text-emerald-300">開啟講師視圖</p>
          <p className="text-sm text-slate-400">
            手機查看各題前 5 名排行與選項文字，方便向全班口述，每 5 秒自動更新
          </p>
        </div>
        <span className="text-emerald-400">→</span>
      </Link>

      <CopyLiveLinkButton sessionId={id} />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">已完成組數</p>
          <p className="mt-1 text-3xl font-bold text-emerald-400">
            {stats.completedGroups}
          </p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">模板</p>
          <p className="mt-1 text-lg font-semibold">{stats.template.name}</p>
        </div>
        <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
          <p className="text-sm text-slate-400">題目數</p>
          <p className="mt-1 text-3xl font-bold">
            {stats.template.questions.length}
          </p>
        </div>
      </div>

      <StatsTable
        questions={stats.questions}
        submissions={stats.submissions}
      />
    </main>
  );
}