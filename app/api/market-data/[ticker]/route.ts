import { NextResponse } from "next/server";
import {
  getFinnhubNews,
  getFinnhubRecommendations,
  getFinnhubPriceTarget,
} from "@/lib/market-data/finnhub";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const normalizedTicker = ticker.trim().toUpperCase();

  if (!normalizedTicker) {
    return NextResponse.json({ error: "Ticker required" }, { status: 400 });
  }

  try {
    const [news, recommendation, priceTarget] = await Promise.all([
      getFinnhubNews(normalizedTicker, 7).catch(() => []),
      getFinnhubRecommendations(normalizedTicker).catch(() => null),
      getFinnhubPriceTarget(normalizedTicker).catch(() => null),
    ]);

    return NextResponse.json(
      { news, recommendation, priceTarget },
      {
        headers: {
          "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    console.error(`Market data fetch failed for ${normalizedTicker}:`, error);
    return NextResponse.json(
      { news: [], recommendation: null, priceTarget: null },
      { status: 200 } // return empty rather than error so UI doesn't break
    );
  }
}
