import { OpsHome } from "@/components/OpsHome";
import { requireOpsPage } from "@/lib/auth";
import { listSessions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  await requireOpsPage("/ops");
  return <OpsHome initialSessions={listSessions()} />;
}
