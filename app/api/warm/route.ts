import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { checkRateLimit } from "@/lib/rate-limit";

// Cache warmer — the "load the level before the player opens the door" endpoint.
// Fired by CacheWarmer (hover/touch on nav links) and right after sign-in, it
// pre-runs the portfolio valuations that dashboard/portfolios/planning/tax all
// block on. The 60s valuation result cache + Vercel's shared fetch cache for
// quotes mean the subsequent real page render finds everything hot.
// Idempotent and cheap when already warm (cache hit = no external calls).
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    // Warming is best-effort; don't let eager hovering turn into load.
    const { limited } = checkRateLimit(`warm:${user.id}`, 6, 60_000);
    if (limited) return NextResponse.json({ ok: true, limited: true });

    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id, cash_balance")
      .eq("user_id", user.id);
    if (!portfolios?.length) return NextResponse.json({ ok: true, warmed: 0 });

    const { data: holdings } = await supabase
      .from("holdings")
      .select("id, portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
      .in("portfolio_id", portfolios.map((p) => p.id));

    const byPortfolio = new Map<string, NonNullable<typeof holdings>>();
    for (const h of holdings ?? []) {
      if (!byPortfolio.has(h.portfolio_id)) byPortfolio.set(h.portfolio_id, []);
      byPortfolio.get(h.portfolio_id)!.push(h);
    }

    await Promise.all(
      portfolios.map((p) =>
        getPortfolioValuation({
          holdings: byPortfolio.get(p.id) ?? [],
          cashBalance: Number(p.cash_balance ?? 0),
        }).catch(() => null),
      ),
    );

    return NextResponse.json({ ok: true, warmed: portfolios.length });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
