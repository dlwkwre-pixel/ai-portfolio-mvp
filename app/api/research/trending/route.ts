import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinnhubQuote, getFinnhubRecommendations } from "@/lib/market-data/finnhub";

// Rank purely by how many BuyTune users hold each ticker (no minimum floor) — with a
// small user base, "most held" is more useful than hiding everything below a threshold.
const MIN_HOLDERS = 1;
const MAX_POPULAR = 8;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET() {
  try {
    const supabase = createAdminClient();

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
      .select("portfolio_id, ticker, company_name")
      .in("portfolio_id", portfolioIds);

    if (hErr || !holdings || holdings.length === 0) {
      return NextResponse.json(
        { trending: [], has_data: false },
        { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    // Count distinct users per ticker; collect first known company name
    const tickerUsers = new Map<string, Set<string>>();
    const tickerNames = new Map<string, string>();
    for (const h of holdings) {
      const userId = userByPortfolio.get(h.portfolio_id);
      if (!userId) continue;
      if (!tickerUsers.has(h.ticker)) tickerUsers.set(h.ticker, new Set());
      tickerUsers.get(h.ticker)!.add(userId);
      if (!tickerNames.has(h.ticker) && h.company_name) {
        tickerNames.set(h.ticker, h.company_name);
      }
    }

    const popularTickers = Array.from(tickerUsers.entries())
      .filter(([, users]) => users.size >= MIN_HOLDERS)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, MAX_POPULAR)
      .map(([ticker]) => ticker);

    if (popularTickers.length === 0) {
      return NextResponse.json(
        { trending: [], has_data: false },
        { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
      );
    }

    // Fetch market data for popular tickers (batched to respect Finnhub rate limits)
    const quotes: Record<string, { price: number; change: number; changePct: number } | null> = {};
    const analystRecs: Record<string, { buy: number; hold: number; sell: number } | null> = {};

    const BATCH_SIZE = 5;
    for (let i = 0; i < popularTickers.length; i += BATCH_SIZE) {
      const batch = popularTickers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (ticker) => {
          const [q, rec] = await Promise.all([
            getFinnhubQuote(ticker).catch(() => null),
            getFinnhubRecommendations(ticker).catch(() => null),
          ]);
          quotes[ticker] = q ? { price: q.c, change: q.d, changePct: q.dp } : null;
          analystRecs[ticker] = rec
            ? {
                buy: (rec.strongBuy ?? 0) + (rec.buy ?? 0),
                hold: rec.hold ?? 0,
                sell: (rec.strongSell ?? 0) + (rec.sell ?? 0),
              }
            : null;
        })
      );
      if (i + BATCH_SIZE < popularTickers.length) await sleep(1000);
    }

    const trending = popularTickers.map((ticker) => ({
      ticker,
      name: tickerNames.get(ticker) ?? ticker,
      ...(quotes[ticker] ?? {}),
      analystRec: analystRecs[ticker] ?? null,
    }));

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
