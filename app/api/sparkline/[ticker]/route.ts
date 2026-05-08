import { NextResponse } from "next/server";
import { getStockCandles } from "@/lib/market-data/chart-service";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

// Sparkline endpoint — uses 1W (5 daily bars) for reliable cross-provider data.
// Full provider chain: Twelve Data → Alpha Vantage → Finnhub.
// Supabase persistent cache means popular tickers hit the provider at most once per TTL
// across ALL users and Vercel instances, keeping Twelve Data well within free tier limits.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { limited, retryAfter } = checkRateLimit(`sparkline:${getIp(_req)}`, 30, 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const { ticker } = await params;
  const sym = ticker.trim().toUpperCase();
  if (!sym || sym.length > 10) {
    return NextResponse.json({ points: [] }, { status: 400 });
  }

  const result = await getStockCandles(sym, "1W").catch(() => ({ candles: [], provider: null }));
  const points = result.candles
    .map((c) => c.close)
    .filter((v) => Number.isFinite(v) && v > 0);

  return NextResponse.json(
    { points },
    {
      // CDN edge cache: serves same ticker from edge for 10 min
      headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" },
    }
  );
}
