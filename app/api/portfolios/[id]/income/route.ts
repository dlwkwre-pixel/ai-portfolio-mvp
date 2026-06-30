import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getFinnhubFactorMetrics } from "@/lib/market-data/finnhub";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type IncomeHolding = {
  ticker: string;
  value: number;
  yieldPct: number;
  annualIncome: number;
  yieldOnCostPct: number | null;
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: portfolio } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .eq("portfolio_id", id);
  const rows = holdings ?? [];
  if (rows.length === 0) return NextResponse.json({ available: true, hasHoldings: false });

  // Value holdings → per-position market value + cost basis.
  let valued: { ticker: string; value: number; cost: number; assetType: string | null }[] = [];
  try {
    const val = await getPortfolioValuation({
      holdings: rows.map((h) => ({ id: h.id, ticker: h.ticker, company_name: h.company_name, asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis, manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at })),
      cashBalance: Number(portfolio.cash_balance ?? 0),
    });
    valued = val.valued_holdings
      .filter((h) => (h.market_value ?? 0) > 0)
      .map((h) => ({ ticker: h.ticker, value: h.market_value ?? 0, cost: Number(h.average_cost_basis ?? 0) * h.shares_number, assetType: h.asset_type ?? null }));
  } catch { /* fall through */ }
  if (valued.length === 0) return NextResponse.json({ available: false });

  const totalValue = valued.reduce((s, h) => s + h.value, 0);

  // Dividend yield per holding (top 25 by value, stock/etf only).
  const targets = valued
    .filter((h) => h.assetType !== "manual" && h.assetType !== "crypto")
    .sort((a, b) => b.value - a.value)
    .slice(0, 25);

  const incomeHoldings: IncomeHolding[] = [];
  await Promise.all(targets.map(async (h) => {
    try {
      const m = await getFinnhubFactorMetrics(h.ticker);
      const y = m?.dividendYield != null && m.dividendYield > 0 ? m.dividendYield : 0;
      if (y > 0) {
        const annualIncome = h.value * (y / 100);
        incomeHoldings.push({
          ticker: h.ticker,
          value: Math.round(h.value),
          yieldPct: Math.round(y * 100) / 100,
          annualIncome,
          yieldOnCostPct: h.cost > 0 ? Math.round((annualIncome / h.cost) * 10000) / 100 : null,
        });
      }
    } catch { /* skip */ }
  }));
  incomeHoldings.sort((a, b) => b.annualIncome - a.annualIncome);

  const projectedAnnual = incomeHoldings.reduce((s, h) => s + h.annualIncome, 0);
  const payerCount = incomeHoldings.length;
  const coveredValue = targets.reduce((s, h) => s + h.value, 0);
  const portfolioYield = totalValue > 0 ? (projectedAnnual / totalValue) * 100 : 0;
  const topPayerPct = projectedAnnual > 0 && incomeHoldings[0] ? (incomeHoldings[0].annualIncome / projectedAnnual) * 100 : 0;

  // Trailing-12mo actual dividends from the cash ledger (reason='dividend').
  const since = new Date(Date.now() - 365 * 86400_000).toISOString();
  const { data: divRows } = await supabase
    .from("cash_ledger")
    .select("amount, effective_at")
    .eq("portfolio_id", id).eq("reason", "dividend").eq("direction", "IN")
    .gte("effective_at", since)
    .then((r) => r, () => ({ data: null }));
  const byMonth: Record<string, number> = {};
  let trailing12 = 0;
  for (const d of divRows ?? []) {
    const amt = Number(d.amount ?? 0);
    trailing12 += amt;
    const key = String(d.effective_at).slice(0, 7); // YYYY-MM
    byMonth[key] = (byMonth[key] ?? 0) + amt;
  }
  // Build last-12-month series ending this month.
  const months: { month: string; amount: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ month: d.toLocaleDateString(undefined, { month: "short" }), amount: Math.round(byMonth[key] ?? 0) });
  }

  return NextResponse.json({
    available: true,
    hasHoldings: true,
    projectedAnnual: Math.round(projectedAnnual),
    monthlyAvg: Math.round(projectedAnnual / 12),
    portfolioYield: Math.round(portfolioYield * 100) / 100,
    payerCount,
    holdingCount: targets.length,
    coveragePct: coveredValue > 0 ? Math.round((coveredValue / totalValue) * 100) : 0,
    topPayerPct: Math.round(topPayerPct),
    holdings: incomeHoldings.slice(0, 20),
    trailing12: Math.round(trailing12),
    months,
    hasActual: (divRows ?? []).length > 0,
  });
}
