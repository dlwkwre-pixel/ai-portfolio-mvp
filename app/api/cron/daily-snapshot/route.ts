import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getBenchmarkComparison } from "@/lib/portfolio/benchmark";

// This route is called daily by Vercel Cron
// It saves a snapshot for every active portfolio and syncs allocations + stats for public portfolios

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use admin client — this job runs without a user session
  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 500 });
  }
  const supabase = adminSupabase;

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("id, user_id, cash_balance, benchmark_symbol")
    .eq("is_active", true);

  if (portfoliosError) {
    console.error("Failed to fetch portfolios:", portfoliosError.message);
    return NextResponse.json({ error: portfoliosError.message }, { status: 500 });
  }

  if (!portfolios || portfolios.length === 0) {
    return NextResponse.json({ message: "No active portfolios found." });
  }

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const portfolio of portfolios) {
    try {
      // Check if a snapshot already exists for today
      const { data: existingSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("id")
        .eq("portfolio_id", portfolio.id)
        .gte("snapshot_date", `${today}T00:00:00`)
        .lte("snapshot_date", `${today}T23:59:59`)
        .maybeSingle();

      if (existingSnapshot) {
        skipCount++;
        continue;
      }

      const { data: holdings } = await supabase
        .from("holdings")
        .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
        .eq("portfolio_id", portfolio.id);

      const cashBalance = Number(portfolio.cash_balance ?? 0);

      const valuation = await getPortfolioValuation({
        holdings: (holdings ?? []).map((h) => ({
          id: h.id,
          ticker: h.ticker,
          company_name: h.company_name,
          asset_type: h.asset_type,
          shares: h.shares,
          average_cost_basis: h.average_cost_basis,
        })),
        cashBalance,
      });

      const totalValue = valuation.total_portfolio_value;

      // Skip snapshot if valuation is zero or invalid (all Finnhub prices missing)
      if (!totalValue || totalValue <= 0 || !Number.isFinite(totalValue)) {
        console.warn(`Skipping snapshot for portfolio ${portfolio.id}: totalValue=${totalValue}`);
        continue;
      }

      const { error: insertError } = await supabase
        .from("portfolio_snapshots")
        .insert({
          portfolio_id: portfolio.id,
          total_value: totalValue,
          cash_balance: cashBalance,
          snapshot_date: new Date().toISOString(),
          notes: "Auto daily snapshot",
        });

      if (insertError) {
        console.error(`Snapshot failed for portfolio ${portfolio.id}:`, insertError.message);
        errorCount++;
        continue;
      }

      successCount++;

      // Sync public portfolio if this portfolio is shared
      try {
        const { data: pubPortfolio } = await adminSupabase
            .from("public_portfolios")
            .select("id, baseline_total_value")
            .eq("source_portfolio_id", portfolio.id)
            .eq("is_public", true)
            .maybeSingle();

          if (pubPortfolio) {
            // 1. Upsert today's performance point
            const baseline = Number(pubPortfolio.baseline_total_value ?? 0);
            const returnPct = baseline > 0 ? ((totalValue - baseline) / baseline) * 100 : 0;
            await adminSupabase
              .from("public_portfolio_performance")
              .upsert(
                { public_portfolio_id: pubPortfolio.id, snapshot_date: today, return_pct: returnPct },
                { onConflict: "public_portfolio_id,snapshot_date" }
              );

            // 2. Rebuild allocations from today's valuation
            const newAllocations: Array<{
              ticker: string;
              company_name: string | null;
              allocation_pct: number;
              is_cash: boolean;
            }> = [];

            if (totalValue > 0) {
              valuation.valued_holdings
                .filter((h) => h.market_value != null && h.market_value > 0)
                .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
                .forEach((h) => {
                  newAllocations.push({
                    ticker: h.ticker,
                    company_name: h.company_name ?? null,
                    allocation_pct: Number(((h.market_value! / totalValue) * 100).toFixed(4)),
                    is_cash: false,
                  });
                });

              if (cashBalance > 0) {
                const cashPct = Number(((cashBalance / totalValue) * 100).toFixed(4));
                if (cashPct > 0.01) {
                  newAllocations.push({ ticker: "CASH", company_name: "Cash", allocation_pct: cashPct, is_cash: true });
                }
              }
            }

            if (newAllocations.length > 0) {
              await adminSupabase
                .from("public_portfolio_holdings")
                .delete()
                .eq("public_portfolio_id", pubPortfolio.id);
              await adminSupabase.from("public_portfolio_holdings").insert(
                newAllocations.map((h, i) => ({
                  public_portfolio_id: pubPortfolio.id,
                  ticker: h.ticker,
                  company_name: h.company_name,
                  allocation_pct: h.allocation_pct,
                  is_cash: h.is_cash,
                  display_order: i,
                }))
              );
            }

            // 3. Compute TWR vs benchmark for share card
            const benchmarkSymbol = portfolio.benchmark_symbol || "SPY";
            let returnPctAlltime: number | null = null;
            let benchmarkReturnPct: number | null = null;
            try {
              const [{ data: snapshots }, { data: cashFlows }] = await Promise.all([
                supabase
                  .from("portfolio_snapshots")
                  .select("snapshot_date, total_value")
                  .eq("portfolio_id", portfolio.id)
                  .order("snapshot_date"),
                supabase
                  .from("portfolio_cashflows")
                  .select("effective_at, direction, amount")
                  .eq("portfolio_id", portfolio.id),
              ]);
              if (snapshots && snapshots.length >= 2) {
                const result = await getBenchmarkComparison({
                  snapshots: snapshots.map((s) => ({ snapshot_date: s.snapshot_date, total_value: s.total_value })),
                  benchmarkSymbol,
                  cashFlows: (cashFlows ?? []).map((c) => ({
                    effective_at: c.effective_at,
                    direction: c.direction,
                    amount: c.amount,
                  })),
                });
                returnPctAlltime = result.portfolioTwrPct ?? result.portfolioReturnPct ?? null;
                benchmarkReturnPct = result.benchmarkReturnPct ?? null;
              }
            } catch {
              // Non-fatal — share card stats will be updated on next manual sync
            }

            // 4. Update last_synced_at + share card stats on public_portfolios
            await adminSupabase
              .from("public_portfolios")
              .update({
                last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...(returnPctAlltime != null
                  ? {
                      return_pct_alltime: Math.round(returnPctAlltime * 100) / 100,
                      benchmark_symbol: benchmarkSymbol,
                      benchmark_return_pct:
                        benchmarkReturnPct != null ? Math.round(benchmarkReturnPct * 100) / 100 : null,
                      stats_updated_at: new Date().toISOString(),
                    }
                  : {}),
              })
              .eq("id", pubPortfolio.id);

            // 5. Sync return_pct back to the linked strategy (for community sort + display)
            const { data: pubPortfolioFull } = await adminSupabase
              .from("public_portfolios")
              .select("linked_strategy_id, created_at")
              .eq("id", pubPortfolio.id)
              .maybeSingle();

            if (pubPortfolioFull?.linked_strategy_id && returnPctAlltime != null) {
              const returnSince = pubPortfolioFull.created_at
                ? new Date(pubPortfolioFull.created_at).toISOString().slice(0, 10)
                : today;

              // Calculate rolling 30-day return from portfolio performance snapshots
              const thirtyDaysAgo = new Date();
              thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
              const { data: monthlyPerf } = await adminSupabase
                .from("public_portfolio_performance")
                .select("snapshot_date, return_pct")
                .eq("public_portfolio_id", pubPortfolio.id)
                .gte("snapshot_date", thirtyDaysAgo.toISOString().slice(0, 10))
                .order("snapshot_date", { ascending: true })
                .limit(31);

              let monthlyReturnPct: number | null = null;
              if (monthlyPerf && monthlyPerf.length >= 2) {
                const first = monthlyPerf[0];
                const last = monthlyPerf[monthlyPerf.length - 1];
                monthlyReturnPct = Math.round((last.return_pct - first.return_pct) * 100) / 100;
              }

              await adminSupabase
                .from("strategies")
                .update({
                  return_pct: Math.round(returnPctAlltime * 100) / 100,
                  return_since: returnSince,
                  ...(monthlyReturnPct != null ? { monthly_return_pct: monthlyReturnPct } : {}),
                })
                .eq("id", pubPortfolioFull.linked_strategy_id);
            }
          }
        } catch (pubErr) {
          console.error(`Public portfolio sync failed for ${portfolio.id}:`, pubErr);
        }
    } catch (err) {
      console.error(`Error processing portfolio ${portfolio.id}:`, err);
      errorCount++;
    }
  }

  return NextResponse.json({
    message: "Snapshots complete.",
    success: successCount,
    skipped: skipCount,
    errors: errorCount,
  });
}
