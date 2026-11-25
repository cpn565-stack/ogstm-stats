import { PublicStatsHome } from "@/components/PublicStatsHome";
import { buildPublicSummary } from "@/lib/history";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const summary = buildPublicSummary();
  return <PublicStatsHome summary={summary} />;
}
