import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinnhubDailyCandles } from "@/lib/market-data/finnhub";
import { getTwelveDataCandles } from "@/lib/market-data/twelve-data";
import { getAlphaVantageCandles } from "@/lib/market-data/alpha-vantage";
import { normalizeForProvider, type CandlePoint } from "@/lib/market-data/chart-service";
import { candlesToHistory, getKronosForecast, type KronosForecastPoint, type KronosHistoryRow } from "@/lib/market-data/kronos";

export const dynamic = "force-dynamic";
export const maxDuration = 90; // cold Render free-tier start + inference — see vercel.json for the matching functions override

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Kept well within the range actually measured against the service's 512MB
// memory cap, not maxed out to Kronos-mini's full 2048-candle context.
const HISTORY_DAYS = 550; // ≈370-380 trading days
const PRED_LEN = 10;

type CachedForecastRow = {
  ticker: string;
  forecast: KronosForecastPoint[];
  pred_len: number;
  generated_at: string;
};

function candlePointsToHistory(points: CandlePoint[]): KronosHistoryRow[] {
  return points.map((p) => ({
    timestamp: new Date(p.timestamp).toISOString(),
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }));
}

// Daily-resolution history for the model, tried across providers in the same
// order the chart provider chain uses — Finnhub's stock/candle endpoint alone
// (the original implementation) is unreliable on this account's plan, the same
// issue the chart provider chain (chart-service.ts) was already built to work
// around, just for a different resolution than its fixed chart ranges cover.
async function fetchDailyHistory(symbol: string): Promise<KronosHistoryRow[] | null> {
  if (process.env.ENABLE_TWELVE_DATA_CHARTS === "true" && process.env.TWELVE_DATA_API_KEY) {
    const td = await getTwelveDataCandles(normalizeForProvider(symbol, "twelve_data"), "KRONOS_1Y").catch(() => null);
    if (td && td.length >= 30) return candlePointsToHistory(td);
  }

  if (process.env.ENABLE_ALPHA_VANTAGE_CHARTS === "true" && process.env.ALPHA_VANTAGE_API_KEY) {
    const av = await getAlphaVantageCandles(symbol, "KRONOS_1Y").catch(() => null);
    if (av && av.length >= 30) return candlePointsToHistory(av);
  }

  const toUnix = Math.floor(Date.now() / 1000);
  const fromUnix = toUnix - HISTORY_DAYS * 86400;
  const candles = await getFinnhubDailyCandles({ symbol, fromUnix, toUnix });
  if (candles && candles.t.length >= 30) return candlesToHistory(candles);

  return null;
}

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

  const history = await fetchDailyHistory(symbol);
  if (!history) {
    return NextResponse.json({ error: `Not enough price history for ${symbol}.` }, { status: 400 });
  }

  const result = await getKronosForecast({
    ticker: symbol,
    history,
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
