import { NextResponse } from "next/server";
import {
  getFinnhubQuote,
  getFinnhubNews,
  getFinnhubRecommendations,
  getFinnhubPriceTarget,
  getFinnhubProfile,
  getFinnhubMetrics,
} from "@/lib/market-data/finnhub";
import { validateTicker } from "@/lib/validation";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const { limited, retryAfter } = checkRateLimit(`research-search:${getIp(request)}`, 20, 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const { searchParams } = new URL(request.url);
  const rawTicker = searchParams.get("ticker") ?? "";
  let ticker: string;
  try {
    ticker = validateTicker(rawTicker);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const [quote, news, recommendation, priceTarget, profile, metrics] = await Promise.all([
      getFinnhubQuote(ticker).catch(() => null),
      getFinnhubNews(ticker, 7).catch(() => []),
      getFinnhubRecommendations(ticker).catch(() => null),
      getFinnhubPriceTarget(ticker).catch(() => null),
      getFinnhubProfile(ticker).catch(() => null),
      getFinnhubMetrics(ticker).catch(() => null),
    ]);

    if (!quote) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
    }

    return NextResponse.json(
      { ticker, quote, news, recommendation, priceTarget, profile, metrics },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch (error) {
    console.error(`Research search failed for ${ticker}:`, error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
