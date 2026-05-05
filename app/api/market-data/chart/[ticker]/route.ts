import { NextResponse } from "next/server";
import { getStockCandles, type ChartRange } from "@/lib/market-data/chart-service";

const VALID_RANGES = new Set<ChartRange>(["1D", "1W", "1M", "3M", "1Y"]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
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

  return NextResponse.json(
    {
      ticker: sym,
      range,
      candle_count: result.candles.length,
      provider: result.provider,
      first_candle: result.candles[0] ?? null,
      last_candle: result.candles[result.candles.length - 1] ?? null,
      _debug: result._debug ?? {
        note: "Set NODE_ENV=development to see full debug output",
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}
