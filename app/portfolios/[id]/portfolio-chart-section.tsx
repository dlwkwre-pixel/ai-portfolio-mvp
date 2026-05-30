"use server";

import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getBenchmarkComparison } from "@/lib/portfolio/benchmark";
import PortfolioChartClient from "./portfolio-chart-client";

type PortfolioChartSectionProps = {
  portfolioId: string;
  benchmarkSymbol: string;
  cashBalance: number;
};

export default async function PortfolioChartSection({
  portfolioId,
  benchmarkSymbol,
  cashBalance,
}: PortfolioChartSectionProps) {
  const supabase = await createClient();

  // Auto-snapshot: at most once every 4 hours per portfolio (free — valuation is already fetched for the page)
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: recentSnapshot } = await supabase
    .from("portfolio_snapshots")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .gte("snapshot_date", fourHoursAgo)
    .limit(1)
    .maybeSingle();

  if (!recentSnapshot) {
    const { data: holdings } = await supabase
      .from("holdings")
      .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
      .eq("portfolio_id", portfolioId);

    const valuation = await getPortfolioValuation({
      holdings: (holdings ?? []).map((h) => ({
        id: h.id, ticker: h.ticker, company_name: h.company_name,
        asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
      })),
      cashBalance,
    });

    // Skip snapshot if valuation is zero or invalid (e.g. all Finnhub prices missing)
    const snapshotValue = valuation.total_portfolio_value;
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

  // Fetch snapshots and cash flows in parallel
  const [{ data: snapshots }, { data: cashFlows }] = await Promise.all([
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
  ]);

  const comparison = await getBenchmarkComparison({
    snapshots: snapshots ?? [],
    benchmarkSymbol: benchmarkSymbol || "SPY",
    cashFlows: (cashFlows ?? []).map((cf) => ({
      effective_at: cf.effective_at,
      direction: cf.direction,
      amount: cf.amount,
    })),
  });

  return (
    <PortfolioChartClient
      portfolioId={portfolioId}
      snapshots={(snapshots ?? []).map((s) => ({
        date: s.snapshot_date,
        total_value: Number(s.total_value),
      }))}
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
    />
  );
}
