import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubNews } from "@/lib/market-data/finnhub";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Get user's portfolios
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id);

  if (!portfolios?.length) return NextResponse.json({ items: [] });

  const portfolioIds = portfolios.map((p) => p.id);

  // Get top holdings by value across all portfolios (cap at 8 unique tickers)
  const { data: holdings } = await supabase
    .from("holdings")
    .select("ticker, quantity, avg_cost")
    .in("portfolio_id", portfolioIds);

  if (!holdings?.length) return NextResponse.json({ items: [] });

  // Aggregate by ticker value estimate (quantity * avg_cost) and pick top 8
  const tickerValue: Record<string, number> = {};
  for (const h of holdings) {
    tickerValue[h.ticker] = (tickerValue[h.ticker] ?? 0) + (h.quantity ?? 0) * (h.avg_cost ?? 0);
  }
  const topTickers = Object.entries(tickerValue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  type NewsItem = { ticker: string; headline: string; source: string; url: string; datetime: number };
  const items: NewsItem[] = [];

  for (const ticker of topTickers) {
    try {
      const tickerNews = await getFinnhubNews(ticker, 3);
      for (const n of tickerNews.slice(0, 3)) {
        items.push({ ticker, headline: n.headline, source: n.source, url: n.url, datetime: n.datetime });
      }
    } catch {
      // skip
    }
  }

  // Sort by datetime descending
  items.sort((a, b) => b.datetime - a.datetime);

  return NextResponse.json(
    { items: items.slice(0, 20) },
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" } }
  );
}
