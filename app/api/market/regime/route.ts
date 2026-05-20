import { NextResponse } from "next/server";
import { getFinnhubQuote, getFinnhubMetrics } from "@/lib/market-data/finnhub";
import { getFredMacroSignals } from "@/lib/market-data/fred";
import { computeRegime } from "@/lib/market-data/regime";
import type { MarketSignals } from "@/lib/market-data/regime";

export const revalidate = 14400; // 4-hour server-side cache

export async function GET() {
  try {
    // Fetch macro + market data in parallel
    const [macroSignals, spyQuote, spyMetrics, qqqQuote] = await Promise.allSettled([
      getFredMacroSignals(),
      getFinnhubQuote("SPY"),
      getFinnhubMetrics("SPY"),
      getFinnhubQuote("QQQ"),
    ]);

    const macro = macroSignals.status === "fulfilled"
      ? macroSignals.value
      : {
          yieldCurveSpread: null, yield10y: null, fedFundsRate: null, fedFundsPrev: null,
          cpi: null, cpiPrev: null, unemployment: null, unemploymentPrev: null,
          creditSpread: null, fredAvailable: false,
        };

    const spy = spyQuote.status === "fulfilled" ? spyQuote.value : null;
    const spyMeta = spyMetrics.status === "fulfilled" ? spyMetrics.value : null;
    const qqq = qqqQuote.status === "fulfilled" ? qqqQuote.value : null;

    // Compute realized volatility proxy from SPY day change %
    // Rough proxy: if dp (daily % change) is large in magnitude, treat as elevated vol signal
    // For a proper vol estimate we'd need candles — using |dp| * scaling as a simple proxy
    const spyDailyMove = spy?.dp !== undefined ? Math.abs(spy.dp) : null;
    // Map daily move to annualized vol proxy: typical daily move ~0.7% → ~11% annualized
    // 0.7% daily → ~11 vol, 1.5% daily → ~24 vol, 2.5% daily → ~40 vol
    const impliedVolProxy = spyDailyMove !== null
      ? Math.round(spyDailyMove * 252 ** 0.5 * 0.7)
      : null;

    // QQQ vs SPY ratio (tech leadership indicator)
    const qqqVsSpyRatio = (spy?.c && qqq?.c) ? qqq.c / spy.c : null;

    const market: MarketSignals = {
      spyPrice: spy?.c ?? null,
      spy52wHigh: spyMeta?.weekHigh52 ?? null,
      spy52wLow: spyMeta?.weekLow52 ?? null,
      spyMomentum1m: null, // would need candle history — skipped for Phase 1
      qqqVsSpyRatio,
      techVsDefensiveRatio: null, // would need XLK/XLU — skipped for Phase 1
      impliedVolProxy,
    };

    const regime = computeRegime(macro, market);

    return NextResponse.json(regime);
  } catch (err) {
    console.error("[regime] failed:", err);
    return NextResponse.json({ error: "Regime calculation failed" }, { status: 500 });
  }
}
