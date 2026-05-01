import { NextResponse } from "next/server";
import { getFinnhubMarketNews } from "@/lib/market-data/finnhub";

export async function GET() {
  try {
    const news = await getFinnhubMarketNews();
    return NextResponse.json(
      { news },
      { headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800" } }
    );
  } catch {
    return NextResponse.json({ news: [] });
  }
}
