import { NextRequest, NextResponse } from "next/server";
import {
  getFinnhubNews,
  getFinnhubRecommendations,
  getFinnhubPriceTarget,
} from "@/lib/market-data/finnhub";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

  const [news, recs, priceTarget] = await Promise.allSettled([
    getFinnhubNews(ticker, 7),
    getFinnhubRecommendations(ticker),
    getFinnhubPriceTarget(ticker),
  ]);

  return NextResponse.json({
    news: news.status === "fulfilled" ? (news.value ?? []).slice(0, 5) : [],
    recommendations: recs.status === "fulfilled" ? recs.value : null,
    priceTarget: priceTarget.status === "fulfilled" ? priceTarget.value : null,
  });
}
