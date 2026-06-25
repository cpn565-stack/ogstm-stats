import { ManualInputForm } from "@/components/ManualInputForm";
import { SessionHeader } from "@/components/SessionHeader";
import { getSession } from "@/lib/store";
import { getTemplate } from "@/lib/template";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ManualInputPage({ params }: PageProps) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) redirect("/ops");

  const template = getTemplate();

  return (
    <main className="space-y-5 sm:space-y-8">
      <SessionHeader
        sessionId={id}
        sessionName={session.name}
        active="manual"
      />
      <ManualInputForm sessionId={id} template={template} />
    </main>
  );
}