import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MIN_HOLDERS = 2;

export async function GET() {
  try {
    const supabase = await createClient();

    const { data: portfolios, error: pErr } = await supabase
      .from("portfolios")
      .select("id, user_id")
      .eq("is_active", true);

    if (pErr || !portfolios || portfolios.length === 0) {
      return NextResponse.json(
        { trending: [], has_data: false },
        { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    const portfolioIds = portfolios.map((p) => p.id);
    const userByPortfolio = new Map(portfolios.map((p) => [p.id, p.user_id]));

    const { data: holdings, error: hErr } = await supabase
      .from("holdings")
      .select("portfolio_id, ticker")
      .in("portfolio_id", portfolioIds);

    if (hErr || !holdings || holdings.length === 0) {
      return NextResponse.json(
        { trending: [], has_data: false },
        { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    // Count distinct users per ticker
    const tickerUsers = new Map<string, Set<string>>();
    for (const h of holdings) {
      const userId = userByPortfolio.get(h.portfolio_id);
      if (!userId) continue;
      if (!tickerUsers.has(h.ticker)) tickerUsers.set(h.ticker, new Set());
      tickerUsers.get(h.ticker)!.add(userId);
    }

    const trending = Array.from(tickerUsers.entries())
      .filter(([, users]) => users.size >= MIN_HOLDERS)
      .map(([ticker, users]) => ({ ticker, company_name: null, holder_count: users.size }))
      .sort((a, b) => b.holder_count - a.holder_count)
      .slice(0, 8);

    return NextResponse.json(
      { trending, has_data: trending.length > 0 },
      { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch {
    return NextResponse.json(
      { trending: [], has_data: false },
      { headers: { "Cache-Control": "s-maxage=30" } }
    );
  }
}
