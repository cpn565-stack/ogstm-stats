import { PresenterView } from "@/components/PresenterView";
import { aggregateSubmissions } from "@/lib/aggregate";
import { getSession, listSubmissions } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PresenterPage({ params }: PageProps) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) redirect("/ops");

  const template = getTemplate();
  const submissions = listSubmissions(id);
  const stats = aggregateSubmissions(session, template, submissions);

  return <PresenterView sessionId={id} initialStats={stats} />;
}