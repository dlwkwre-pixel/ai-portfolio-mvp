import { NextResponse } from "next/server";
import { getBenchmarkHistory, toIndexedSeries } from "@/lib/market-data/finnhub-benchmark";

export async function GET() {
  try {
    const bars = await getBenchmarkHistory("SPY", "1Y", true);
    const indexed = toIndexedSeries(bars);

    return NextResponse.json({
      ok: true,
      barCount: bars.length,
      firstBar: bars[0] ?? null,
      lastBar: bars[bars.length - 1] ?? null,
      firstIndexed: indexed[0] ?? null,
      lastIndexed: indexed[indexed.length - 1] ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}