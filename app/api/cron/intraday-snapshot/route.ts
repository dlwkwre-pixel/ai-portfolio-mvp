import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

// Runs every 30 min during market hours via Vercel Cron.
// Stores intraday portfolio snapshots so the 1D and 1W chart views have granular data.
export const maxDuration = 60;

const POLYGON_KEY = process.env.POLYGON_API_KEY;

async function isMarketOpen(): Promise<boolean> {
  if (!POLYGON_KEY) {
    // Fall back to time-based check: Mon–Fri 13:30–20:00 UTC covers NYSE hours
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const min = now.getUTCMinutes();
    const minutesUTC = hour * 60 + min;
    return day >= 1 && day <= 5 && minutesUTC >= 810 && minutesUTC <= 1200; // 13:30–20:00 UTC
  }
  try {
    const res = await fetch(
      `https://api.polygon.io/v1/marketstatus/now?apiKey=${POLYGON_KEY}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return true; // assume open on failure
    const data = await res.json();
    return data.market === "open";
  } catch {
    return true;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const marketOpen = await isMarketOpen();
  if (!marketOpen) {
    return NextResponse.json({ message: "Market closed — skipping intraday snapshot." });
  }

  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 500 });
  }
  const supabase = adminSupabase;

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("id, cash_balance")
    .eq("is_active", true);

  if (portfoliosError || !portfolios?.length) {
    return NextResponse.json({ message: "No active portfolios." });
  }

  const now = new Date();
  const twentyFiveMinutesAgo = new Date(now.getTime() - 25 * 60 * 1000).toISOString();

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const portfolio of portfolios) {
    try {
      // Skip if we already took a snapshot in the last 25 minutes
      const { data: recent } = await supabase
        .from("portfolio_snapshots")
        .select("id")
        .eq("portfolio_id", portfolio.id)
        .gte("snapshot_date", twentyFiveMinutesAgo)
        .limit(1)
        .maybeSingle();

      if (recent) {
        skipCount++;
        continue;
      }

      const { data: holdings } = await supabase
        .from("holdings")
        .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
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
          manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
        })),
        cashBalance,
      });

      const totalValue = valuation.total_portfolio_value;
      if (!totalValue || totalValue <= 0 || !Number.isFinite(totalValue)) {
        skipCount++;
        continue;
      }

      const { error: insertError } = await supabase
        .from("portfolio_snapshots")
        .insert({
          portfolio_id: portfolio.id,
          total_value: totalValue,
          cash_balance: cashBalance,
          snapshot_date: now.toISOString(),
          notes: "intraday",
        });

      if (insertError) {
        errorCount++;
      } else {
        successCount++;
      }
    } catch {
      errorCount++;
    }
  }

  return NextResponse.json({ message: "Intraday snapshots complete.", success: successCount, skipped: skipCount, errors: errorCount });
}
