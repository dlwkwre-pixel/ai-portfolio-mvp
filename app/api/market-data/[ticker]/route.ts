import { NextResponse } from "next/server";
import {
  getFinnhubNews,
  getFinnhubRecommendations,
  getFinnhubPriceTarget,
  getFinnhubProfile,
} from "@/lib/market-data/finnhub";
import { validateTicker } from "@/lib/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  let normalizedTicker: string;
  try {
    normalizedTicker = validateTicker(ticker);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const [news, recommendation, priceTarget, profile] = await Promise.all([
      getFinnhubNews(normalizedTicker, 7).catch(() => []),
      getFinnhubRecommendations(normalizedTicker).catch(() => null),
      getFinnhubPriceTarget(normalizedTicker).catch(() => null),
      getFinnhubProfile(normalizedTicker).catch(() => null),
    ]);

    return NextResponse.json(
      { news, recommendation, priceTarget, profile },
      {
        headers: {
          "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600",
        },
      }
    );
  } catch (error) {
    console.error(`Market data fetch failed for ${normalizedTicker}:`, error);
    return NextResponse.json(
      { news: [], recommendation: null, priceTarget: null, profile: null },
      { status: 200 }
    );
  }
}
