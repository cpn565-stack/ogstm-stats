import { PhotoInputForm } from "@/components/PhotoInputForm";
import { SessionHeader } from "@/components/SessionHeader";
import { requireOpsPage } from "@/lib/auth";
import { getSession } from "@/lib/store";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PhotoInputPage({ params }: PageProps) {
  const { id } = await params;
  await requireOpsPage(`/session/${id}/photo`);
  const session = getSession(id);
  if (!session) redirect("/ops");

  return (
    <main className="space-y-8">
      <SessionHeader
        sessionId={id}
        sessionName={session.name}
        active="photo"
      />
      <PhotoInputForm sessionId={id} />
    </main>
  );
}