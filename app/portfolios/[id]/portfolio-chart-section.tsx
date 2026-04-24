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

  // Auto-snapshot: if no snapshot exists for today, create one silently
  const today = new Date().toISOString().split("T")[0];
  const { data: todaySnapshot } = await supabase
    .from("portfolio_snapshots")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .gte("snapshot_date", `${today}T00:00:00`)
    .lte("snapshot_date", `${today}T23:59:59`)
    .maybeSingle();

  if (!todaySnapshot) {
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

    await supabase.from("portfolio_snapshots").insert({
      portfolio_id: portfolioId,
      total_value: valuation.total_portfolio_value,
      cash_balance: cashBalance,
      snapshot_date: new Date().toISOString(),
      notes: "Auto snapshot",
    }).then(() => {});
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
