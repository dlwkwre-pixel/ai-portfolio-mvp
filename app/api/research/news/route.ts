import { NextResponse } from "next/server";
import { getFinnhubMarketNews } from "@/lib/market-data/finnhub";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const { limited, retryAfter } = checkRateLimit(`research-news:${getIp(req)}`, 10, 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
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
