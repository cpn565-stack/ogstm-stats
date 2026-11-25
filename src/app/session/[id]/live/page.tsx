import { LiveStatsView } from "@/components/LiveStatsView";
import {
  aggregateSubmissions,
  redactStatsForPublicLink,
} from "@/lib/aggregate";
import { getOpsSession } from "@/lib/auth";
import { getSession, listSubmissions } from "@/lib/store";
import { getTemplate } from "@/lib/template";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LiveStatsPage({ params }: PageProps) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-slate-300">找不到此場次</p>
        <p className="mt-2 text-sm text-slate-500">
          連結可能已失效，請向助教確認最新網址。
        </p>
      </main>
    );
  }

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);
  const isAuthenticated = await getOpsSession();

  return (
    <LiveStatsView
      sessionId={id}
      initialStats={isAuthenticated ? stats : redactStatsForPublicLink(stats)}
    />
  );
}
