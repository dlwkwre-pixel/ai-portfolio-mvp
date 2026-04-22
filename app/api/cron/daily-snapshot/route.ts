import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

// This route is called daily by Vercel Cron
// It automatically saves a snapshot of every active portfolio's current value

export async function GET(request: Request) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // Get all active portfolios across all users
  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("id, user_id, cash_balance")
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
        continue; // Already snapshotted today, skip
      }

      // Get current holdings to calculate total value
      const { data: holdings } = await supabase
        .from("holdings")
        .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
        .eq("portfolio_id", portfolio.id);

      const valuation = await getPortfolioValuation({
        holdings: (holdings ?? []).map((h) => ({
          id: h.id,
          ticker: h.ticker,
          company_name: h.company_name,
          asset_type: h.asset_type,
          shares: h.shares,
          average_cost_basis: h.average_cost_basis,
        })),
        cashBalance: Number(portfolio.cash_balance ?? 0),
      });

      const totalValue = valuation.total_portfolio_value;

      // Save snapshot
      const { error: insertError } = await supabase
        .from("portfolio_snapshots")
        .insert({
          portfolio_id: portfolio.id,
          total_value: totalValue,
          cash_balance: Number(portfolio.cash_balance ?? 0),
          snapshot_date: new Date().toISOString(),
          notes: "Auto daily snapshot",
        });

      if (insertError) {
        console.error(`Snapshot failed for portfolio ${portfolio.id}:`, insertError.message);
        errorCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      console.error(`Error processing portfolio ${portfolio.id}:`, err);
      errorCount++;
    }
  }

  return NextResponse.json({
    message: `Snapshots complete.`,
    success: successCount,
    skipped: skipCount,
    errors: errorCount,
  });
}
