import { NextResponse } from "next/server";
import {
  getFinnhubQuote,
  getFinnhubNews,
  getFinnhubRecommendations,
  getFinnhubPriceTarget,
  getFinnhubProfile,
} from "@/lib/market-data/finnhub";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim().toUpperCase();

  if (!ticker) {
    return NextResponse.json({ error: "Ticker required" }, { status: 400 });
  }

  try {
    const [quote, news, recommendation, priceTarget, profile] = await Promise.all([
      getFinnhubQuote(ticker).catch(() => null),
      getFinnhubNews(ticker, 7).catch(() => []),
      getFinnhubRecommendations(ticker).catch(() => null),
      getFinnhubPriceTarget(ticker).catch(() => null),
      getFinnhubProfile(ticker).catch(() => null),
    ]);

    if (!quote) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
    }

    return NextResponse.json(
      { ticker, quote, news, recommendation, priceTarget, profile },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch (error) {
    console.error(`Research search failed for ${ticker}:`, error);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
