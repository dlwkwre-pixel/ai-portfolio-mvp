import { NextResponse } from "next/server";
import { getStockCandles, type ChartRange } from "@/lib/market-data/chart-service";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

const DEV = process.env.NODE_ENV === "development";

const VALID_RANGES = new Set<ChartRange>(["1D", "1W", "1M", "3M", "1Y"]);

// s-maxage values in seconds per range
const RANGE_TTL: Record<ChartRange, number> = {
  "1D":  180,
  "1W":  1200,
  "1M":  2700,
  "3M":  10800,
  "1Y":  43200,
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { limited, retryAfter } = checkRateLimit(`stock-chart:${getIp(req)}`, 20, 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const { ticker } = await params;
  const { searchParams } = new URL(req.url);
  const range = (searchParams.get("range") ?? "1D") as ChartRange;

  if (!ticker || !VALID_RANGES.has(range)) {
    return NextResponse.json({ error: "Invalid ticker or range" }, { status: 400 });
  }

  const sym = ticker.trim().toUpperCase();
  if (!sym || sym.length > 10) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const result = await getStockCandles(sym, range).catch(() => ({ candles: [], provider: null, _debug: undefined }));
  const ttl = RANGE_TTL[range];

  return NextResponse.json(
    {
      ticker: sym,
      range,
      candles: result.candles,
      provider: result.provider,
      ...(DEV ? { _debug: result._debug } : {}),
    },
    {
      headers: {
        "Cache-Control": `s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
      },
    }
  );
}
