import { NextResponse } from "next/server";

// Lightweight sparkline endpoint — uses Finnhub daily candles (60 req/min free tier).
// Reserved Twelve Data for the full interactive chart; this keeps card-level sparklines
// completely off the Twelve Data quota.

const _cache = new Map<string, { points: number[]; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000; // 10 min

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const sym = ticker.trim().toUpperCase();
  if (!sym || sym.length > 10) {
    return NextResponse.json({ points: [] }, { status: 400 });
  }

  const cached = _cache.get(sym);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(
      { points: cached.points },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  }

  const fhKey = process.env.FINNHUB_API_KEY;
  if (!fhKey) return NextResponse.json({ points: [] });

  const now  = Math.floor(Date.now() / 1000);
  const from = now - 8 * 86400; // 8-day window to ensure we get ~5 trading days

  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol",     sym);
  url.searchParams.set("resolution", "D");
  url.searchParams.set("from",       String(from));
  url.searchParams.set("to",         String(now));
  url.searchParams.set("token",      fhKey);

  try {
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });

    if (!res.ok) return NextResponse.json({ points: [] });

    const data = await res.json() as { s?: string; c?: number[] };
    if (data?.s !== "ok" || !Array.isArray(data.c) || data.c.length < 2) {
      return NextResponse.json({ points: [] });
    }

    const points = data.c.filter((v) => Number.isFinite(v) && v > 0);
    _cache.set(sym, { points, expiresAt: Date.now() + TTL_MS });

    return NextResponse.json(
      { points },
      { headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1200" } }
    );
  } catch {
    return NextResponse.json({ points: [] });
  }
}
