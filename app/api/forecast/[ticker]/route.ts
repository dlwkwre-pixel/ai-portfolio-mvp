import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinnhubDailyCandles } from "@/lib/market-data/finnhub";
import { candlesToHistory, getKronosForecast, type KronosForecastPoint } from "@/lib/market-data/kronos";

export const dynamic = "force-dynamic";
export const maxDuration = 90; // cold Space start + inference — see vercel.json for the matching functions override

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 550; // ≈370-380 trading days, comfortably within Kronos-small's 512-candle context
const PRED_LEN = 10;

type CachedForecastRow = {
  ticker: string;
  forecast: KronosForecastPoint[];
  pred_len: number;
  generated_at: string;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || symbol.length > 12) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  if (process.env.ENABLE_KRONOS_FORECAST !== "true") {
    return NextResponse.json({ error: "Forecasting is not enabled." }, { status: 503 });
  }

  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "true";

  if (!forceRefresh) {
    const { data: cached } = await supabase
      .from("kronos_forecasts").select("ticker, forecast, pred_len, generated_at").eq("ticker", symbol).maybeSingle()
      .then((r) => r as { data: CachedForecastRow | null }, () => ({ data: null }));

    if (cached && Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS) {
      return NextResponse.json({
        ticker: symbol,
        forecast: cached.forecast,
        generatedAt: cached.generated_at,
        cached: true,
      });
    }
  }

  const toUnix = Math.floor(Date.now() / 1000);
  const fromUnix = toUnix - HISTORY_DAYS * 86400;
  const candles = await getFinnhubDailyCandles({ symbol, fromUnix, toUnix });
  if (!candles || candles.t.length < 30) {
    return NextResponse.json({ error: `Not enough price history for ${symbol}.` }, { status: 400 });
  }

  const result = await getKronosForecast({
    ticker: symbol,
    history: candlesToHistory(candles),
    predLen: PRED_LEN,
  });
  if (!result) {
    return NextResponse.json(
      { error: "Forecast service unavailable — the model may be waking up, try again in a moment." },
      { status: 502 }
    );
  }

  try {
    const admin = createAdminClient();
    await admin.from("kronos_forecasts").upsert({
      ticker: symbol,
      forecast: result.points,
      pred_len: result.predLen,
      generated_at: result.generatedAt,
    });
  } catch {
    // Cache write is best-effort — a failed upsert shouldn't fail the request.
  }

  return NextResponse.json({
    ticker: symbol,
    forecast: result.points,
    generatedAt: result.generatedAt,
    cached: false,
  });
}
