import { NextResponse } from "next/server";
import { getFinnhubQuote, getFinnhubMetrics } from "@/lib/market-data/finnhub";
import { getFredMacroSignals } from "@/lib/market-data/fred";
import { getFmpMarketBreadth } from "@/lib/market-data/fmp-breadth";
import { computeRegime } from "@/lib/market-data/regime";
import type { MarketSignals } from "@/lib/market-data/regime";
import { createAdminClient } from "@/lib/supabase/admin";

export const revalidate = 14400; // 4-hour server-side cache

export async function GET() {
  try {
    // Fetch macro + market data in parallel
    const [macroSignals, spyQuote, spyMetrics, qqqQuote, xlkQuote, xluQuote, xlvQuote, xleQuote, xlfQuote, xliQuote, breadth] =
      await Promise.allSettled([
        getFredMacroSignals(),
        getFinnhubQuote("SPY"),
        getFinnhubMetrics("SPY"),
        getFinnhubQuote("QQQ"),
        getFinnhubQuote("XLK"),
        getFinnhubQuote("XLU"),
        getFinnhubQuote("XLV"),
        getFinnhubQuote("XLE"),
        getFinnhubQuote("XLF"),
        getFinnhubQuote("XLI"),
        getFmpMarketBreadth(),
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
    const xlk = xlkQuote.status === "fulfilled" ? xlkQuote.value : null;
    const xlu = xluQuote.status === "fulfilled" ? xluQuote.value : null;
    const xlv = xlvQuote.status === "fulfilled" ? xlvQuote.value : null;
    const xle = xleQuote.status === "fulfilled" ? xleQuote.value : null;
    const xlf = xlfQuote.status === "fulfilled" ? xlfQuote.value : null;
    const xli = xliQuote.status === "fulfilled" ? xliQuote.value : null;
    const breadthData = breadth.status === "fulfilled" ? breadth.value : null;

    // Sector ETF breadth fallback: count sectors with positive daily % change
    const sectorBreadthFallback = (() => {
      const dps = [xlk?.dp, xlu?.dp, xlv?.dp, xle?.dp, xlf?.dp, xli?.dp].filter((v): v is number => typeof v === "number");
      if (dps.length < 3) return null;
      const advancing = dps.filter((v) => v > 0).length;
      return { ratio: advancing / dps.length, advancing, declining: dps.length - advancing, unchanged: 0 };
    })();

    // Implied vol proxy from SPY daily % move
    const spyDailyMove = spy?.dp !== undefined ? Math.abs(spy.dp) : null;
    const impliedVolProxy = spyDailyMove !== null
      ? Math.round(spyDailyMove * 252 ** 0.5 * 0.7)
      : null;

    // QQQ vs SPY ratio (tech leadership indicator — kept for compatibility)
    const qqqVsSpyRatio = (spy?.c && qqq?.c) ? qqq.c / spy.c : null;

    // Tech vs defensive: XLK daily % minus XLU daily % (positive = tech outperforming)
    const techVsDefensiveRatio =
      xlk?.dp !== undefined && xlu?.dp !== undefined
        ? xlk.dp - xlu.dp
        : null;

    const market: MarketSignals = {
      spyPrice: spy?.c ?? null,
      spy52wHigh: spyMeta?.weekHigh52 ?? null,
      spy52wLow: spyMeta?.weekLow52 ?? null,
      spyMomentum1m: null,
      qqqVsSpyRatio,
      techVsDefensiveRatio,
      impliedVolProxy,
      marketBreadthRatio: breadthData?.ratio ?? sectorBreadthFallback?.ratio ?? null,
    };

    const regime = computeRegime(macro, market);

    // Persist snapshot for trend history (fire-and-forget — non-critical)
    void (async () => {
      try {
        const admin = createAdminClient();
        const today = new Date().toISOString().slice(0, 10);
        await admin.from("market_regime_snapshots").upsert(
          {
            date: today,
            level: regime.level,
            score: regime.score,
            label: regime.label,
            dimensions: regime.dimensions,
            narrative: regime.narrative,
            data_quality: regime.dataQuality,
            calculated_at: regime.calculatedAt,
          },
          { onConflict: "date" }
        );
      } catch {
        // Non-critical — table may not exist yet, do not fail the response
      }
    })();

    return NextResponse.json(regime);
  } catch (err) {
    console.error("[regime] failed:", err);
    return NextResponse.json({ error: "Regime calculation failed" }, { status: 500 });
  }
}
