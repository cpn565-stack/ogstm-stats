import { PublicStatsHome } from "@/components/PublicStatsHome";
import { buildPublicSummary } from "@/lib/history";

export default function HomePage() {
  const summary = buildPublicSummary();
  return <PublicStatsHome summary={summary} />;
}