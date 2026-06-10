"use server";

import { createClient } from "@/lib/supabase/server";
import { getBenchmarkComparison } from "@/lib/portfolio/benchmark";
import PortfolioChartClient from "./portfolio-chart-client";

type PortfolioChartSectionProps = {
  portfolioId: string;
  benchmarkSymbol: string;
  cashBalance: number;
  /** Pre-computed total portfolio value from the parent page — avoids a duplicate Finnhub batch. */
  totalPortfolioValue?: number;
};

export default async function PortfolioChartSection({
  portfolioId,
  benchmarkSymbol,
  cashBalance,
  totalPortfolioValue,
}: PortfolioChartSectionProps) {
  const supabase = await createClient();

  // Auto-snapshot: at most once every 4 hours.
  // Use the totalPortfolioValue passed from the parent (already fetched via Finnhub) so we
  // never make a second batch of Finnhub calls on the same page load.
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: recentSnapshot } = await supabase
    .from("portfolio_snapshots")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .gte("snapshot_date", fourHoursAgo)
    .limit(1)
    .maybeSingle();

  if (!recentSnapshot) {
    // Use the pre-computed value if available; otherwise skip (avoids duplicate Finnhub batch)
    const snapshotValue = totalPortfolioValue ?? 0;
    if (snapshotValue > 0 && Number.isFinite(snapshotValue)) {
      await supabase.from("portfolio_snapshots").insert({
        portfolio_id: portfolioId,
        total_value: snapshotValue,
        cash_balance: cashBalance,
        snapshot_date: new Date().toISOString(),
        notes: "Auto snapshot",
      }).then(() => {});
    }
  }

  // Fetch snapshots, cash flows, holdings metadata, and lot dates in parallel
  const [{ data: snapshots }, { data: cashFlows }, { data: holdingsMeta }, { data: lotsData }] = await Promise.all([
    supabase
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value")
      .eq("portfolio_id", portfolioId)
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("cash_ledger")
      .select("effective_at, direction, amount")
      .eq("portfolio_id", portfolioId)
      .order("effective_at", { ascending: true }),
    supabase
      .from("holdings")
      .select("ticker, opened_at")
      .eq("portfolio_id", portfolioId),
    supabase
      .from("holding_lots")
      .select("holding_id, purchased_at, lot_type")
      .eq("portfolio_id", portfolioId),
  ]);

  // One earliest BUY/DRIP date per holding — used to anchor chart start
  const earliestByHolding = new Map<string, string>();
  for (const lot of lotsData ?? []) {
    const t = ((lot.lot_type as string | null) ?? "BUY").toUpperCase();
    if (t !== "BUY" && t !== "DRIP") continue;
    const date = (lot.purchased_at as string).slice(0, 10);
    const prev = earliestByHolding.get(lot.holding_id as string);
    if (!prev || date < prev) earliestByHolding.set(lot.holding_id as string, date);
  }
  const holdingEarliestDates = [...earliestByHolding.values()];

  const comparison = await getBenchmarkComparison({
    snapshots: snapshots ?? [],
    benchmarkSymbol: benchmarkSymbol || "SPY",
    cashFlows: (cashFlows ?? []).map((cf) => ({
      effective_at: cf.effective_at,
      direction: cf.direction,
      amount: cf.amount,
    })),
    holdingEarliestDates,
  });

  return (
    <PortfolioChartClient
      portfolioId={portfolioId}
      chartData={comparison.chartData}
      benchmarkSymbol={comparison.benchmarkSymbol}
      portfolioReturnPct={comparison.portfolioReturnPct}
      portfolioTwrPct={comparison.portfolioTwrPct}
      benchmarkReturnPct={comparison.benchmarkReturnPct}
      excessReturnPct={comparison.excessReturnPct}
      excessTwrPct={comparison.excessTwrPct}
      startDateLabel={comparison.startDateLabel}
      endDateLabel={comparison.endDateLabel}
      hasEnoughSnapshots={comparison.hasEnoughSnapshots}
      netInvested={comparison.netInvested}
      holdings={(holdingsMeta ?? []).map((h) => ({ ticker: String(h.ticker), opened_at: h.opened_at as string | null }))}
    />
  );
}
