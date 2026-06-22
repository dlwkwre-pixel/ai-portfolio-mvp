import { NextResponse } from "next/server";
import { getCongressActivity, getCongressTradesForTicker } from "@/lib/market-data/congress";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

// Congressional trading activity from the free House/Senate Stock Watcher datasets.
// GET /api/research/congress           -> recent trades + most-traded tickers
// GET /api/research/congress?ticker=X  -> per-ticker congressional activity
export async function GET(req: Request) {
  const { limited, retryAfter } = checkRateLimit(`research-congress:${getIp(req)}`, 10, 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const ticker = new URL(req.url).searchParams.get("ticker");

  try {
    if (ticker) {
      const data = await getCongressTradesForTicker(ticker);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "s-maxage=43200, stale-while-revalidate=86400" },
      });
    }
    const activity = await getCongressActivity();
    return NextResponse.json(activity, {
      headers: { "Cache-Control": "s-maxage=43200, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ trades: [], topTickers: [], updatedAt: new Date().toISOString() });
  }
}
