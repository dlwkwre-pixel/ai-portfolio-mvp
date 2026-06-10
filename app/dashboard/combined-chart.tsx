import { createClient } from "@/lib/supabase/server";
import type { CombinedChartPoint } from "./combined-chart-client";
import CombinedChartClient from "./combined-chart-client";

export default async function CombinedChart({
  portfolioIds,
  portfolioValues,
}: {
  portfolioIds: string[];
  portfolioValues: Record<string, number>;
}) {
  if (portfolioIds.length === 0) return null;

  const supabase = await createClient();

  // Auto-snapshot: once per calendar day per portfolio
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todaySnaps } = await supabase
    .from("portfolio_snapshots")
    .select("portfolio_id")
    .in("portfolio_id", portfolioIds)
    .gte("snapshot_date", todayStart.toISOString());

  const alreadySnappedToday = new Set((todaySnaps ?? []).map(s => s.portfolio_id));
  const toInsert = portfolioIds
    .filter(pid => !alreadySnappedToday.has(pid) && (portfolioValues[pid] ?? 0) > 0)
    .map(pid => ({
      portfolio_id: pid,
      total_value: portfolioValues[pid],
      snapshot_date: new Date().toISOString(),
      notes: "Auto snapshot",
    }));

  if (toInsert.length > 0) {
    await supabase.from("portfolio_snapshots").insert(toInsert);
  }

  // Fetch all snapshots for these portfolios
  const { data: snapshots } = await supabase
    .from("portfolio_snapshots")
    .select("portfolio_id, snapshot_date, total_value")
    .in("portfolio_id", portfolioIds)
    .order("snapshot_date", { ascending: true });

  if (!snapshots || snapshots.length < 2) return null;

  // Group by portfolio → date → last known value
  const byPortfolio = new Map<string, Map<string, number>>();
  for (const s of snapshots) {
    const day = s.snapshot_date.slice(0, 10);
    if (!byPortfolio.has(s.portfolio_id)) byPortfolio.set(s.portfolio_id, new Map());
    byPortfolio.get(s.portfolio_id)!.set(day, Number(s.total_value));
  }

  // All unique dates sorted
  const allDates = [...new Set(snapshots.map(s => s.snapshot_date.slice(0, 10)))].sort();
  if (allDates.length < 2) return null;

  // Forward-fill each portfolio, sum per date
  const chartData: CombinedChartPoint[] = allDates.map(date => {
    let total = 0;
    for (const [, dateMap] of byPortfolio) {
      // Last known value at or before this date
      let lastVal: number | null = null;
      for (const [d, v] of dateMap) {
        if (d <= date) lastVal = v;
      }
      if (lastVal !== null) total += lastVal;
    }
    return { date, total };
  });

  // Drop leading zeros (before any portfolio had data)
  const firstNonZero = chartData.findIndex(p => p.total > 0);
  const trimmed = firstNonZero > 0 ? chartData.slice(firstNonZero) : chartData;

  if (trimmed.length < 2) return null;

  return <CombinedChartClient data={trimmed} portfolioIds={portfolioIds} />;
}
