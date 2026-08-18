import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getBenchmarkHistory } from "@/lib/market-data/finnhub-benchmark";
import { BACKTEST_UNIVERSE } from "@/lib/backtest/universe";
import type { RangeKey, BenchmarkBar } from "@/lib/market-data/type";
import type { ScannerBounds } from "@/app/strategies/types";

const SIGNAL_5D_RETURN_PCT = 6; // fixed generic momentum trigger, not strategy-specific
const VOLUME_MULTIPLE = 1.5;
const DEFAULT_STOP_LOSS_PCT = 15;
const STARTING_EQUITY = 100;
const TRANSACTION_COST_PCT = 0.05; // 5bps each way — entry and exit
const WINNER_THRESHOLD_PCT = 15; // once up this much from entry, treat as a "winner" and let it run
const TRAILING_STOP_PCT = 10; // winners exit on a pullback this large from their peak, not from entry
const MAX_HOLD_MULTIPLIER = 3; // even winners force-close after holdWindow * this, so the sim stays bounded
const FETCH_BATCH_SIZE = 20;
const REGIME_TREND_WINDOW = 50; // days of lead-in needed before a day can be classified
const REGIME_VOL_WINDOW = 20;
const REGIME_HIGH_VOL_ANNUALIZED_PCT = 25;
const SWEEP_STOP_LOSS_VALUES = [6, 8, 10, 12, 15, 20, 25];

export const DISCLAIMER =
  `This tests the strategy's numeric risk parameters (position sizing, stop-loss %, cash range, trade pacing) using a fixed, generic momentum/volume trigger as a stand-in for 'the AI found a candidate' — it does NOT replay what Atlas would have actually picked, since that judgment can't be tested historically. Universe is today's ~${BACKTEST_UNIVERSE.length} most liquid large/mid-caps, not the historical constituent list at the time, so results carry survivorship bias. A ${TRANSACTION_COST_PCT}% per-trade cost is applied each way to keep results realistic. Winners are allowed to run past the normal hold window (trailing stop from peak instead of a fixed exit) once up ${WINNER_THRESHOLD_PCT}%+; losers are still cut fast via the hard stop-loss. Treat this as a check on the risk framework, not a performance guarantee.`;

async function fetchInBatches<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

type SimBar = { date: string; close: number; volume: number | null };

type Trade = { entryDate: string; exitDate: string; pnlPct: number };

type BacktestRequest = {
  strategy_id: string;
  lookback: RangeKey;
  save?: boolean;
  sweep?: boolean;
};

type RegimeBucket = "Uptrend" | "Downtrend" | "Choppy / High-Vol";

function classifyRegimes(spyBars: BenchmarkBar[]): Map<string, RegimeBucket> {
  const byDate = new Map<string, RegimeBucket>();
  for (let i = 0; i < spyBars.length; i++) {
    if (i < REGIME_TREND_WINDOW) continue;
    const trendWindow = spyBars.slice(i - REGIME_TREND_WINDOW, i);
    const sma = trendWindow.reduce((s, b) => s + b.adjClose, 0) / trendWindow.length;

    const volWindow = spyBars.slice(Math.max(0, i - REGIME_VOL_WINDOW), i);
    const dailyReturns: number[] = [];
    for (let j = 1; j < volWindow.length; j++) {
      if (volWindow[j - 1].adjClose > 0) dailyReturns.push(volWindow[j].adjClose / volWindow[j - 1].adjClose - 1);
    }
    const mean = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
    const variance = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length : 0;
    const annualizedVolPct = Math.sqrt(variance) * Math.sqrt(252) * 100;

    const bucket: RegimeBucket = annualizedVolPct >= REGIME_HIGH_VOL_ANNUALIZED_PCT
      ? "Choppy / High-Vol"
      : spyBars[i].adjClose >= sma ? "Uptrend" : "Downtrend";
    byDate.set(spyBars[i].date, bucket);
  }
  return byDate;
}

function summarizeByRegime(
  curve: { date: string; value: number }[],
  closedTrades: Trade[],
  regimeByDate: Map<string, RegimeBucket>
) {
  const buckets: Record<RegimeBucket, { days: number; product: number; wins: number; trades: number }> = {
    "Uptrend": { days: 0, product: 1, wins: 0, trades: 0 },
    "Downtrend": { days: 0, product: 1, wins: 0, trades: 0 },
    "Choppy / High-Vol": { days: 0, product: 1, wins: 0, trades: 0 },
  };

  for (let i = 1; i < curve.length; i++) {
    const bucket = regimeByDate.get(curve[i].date);
    if (!bucket || curve[i - 1].value <= 0) continue;
    const dailyReturn = curve[i].value / curve[i - 1].value - 1;
    buckets[bucket].days += 1;
    buckets[bucket].product *= (1 + dailyReturn);
  }

  for (const trade of closedTrades) {
    const bucket = regimeByDate.get(trade.entryDate);
    if (!bucket) continue;
    buckets[bucket].trades += 1;
    if (trade.pnlPct > 0) buckets[bucket].wins += 1;
  }

  const totalClassifiedDays = buckets["Uptrend"].days + buckets["Downtrend"].days + buckets["Choppy / High-Vol"].days;

  return (Object.keys(buckets) as RegimeBucket[]).map((bucket) => ({
    regime: bucket,
    days_pct: totalClassifiedDays > 0 ? (buckets[bucket].days / totalClassifiedDays) * 100 : 0,
    strategy_return_pct: (buckets[bucket].product - 1) * 100,
    trade_count: buckets[bucket].trades,
    win_rate_pct: buckets[bucket].trades > 0 ? (buckets[bucket].wins / buckets[bucket].trades) * 100 : 0,
  }));
}

function parseStopLossPct(promptText: string | null): number {
  if (!promptText) return DEFAULT_STOP_LOSS_PCT;
  const patterns = [
    /down\s+(?:more than|over|by more than|by over)?\s*(\d+(?:\.\d+)?)\s*%[^.]{0,100}sell/i,
    /sell[^.]{0,100}down\s+(?:more than|over)?\s*(\d+(?:\.\d+)?)\s*%/i,
    /stop[- ]loss[^.\d]{0,40}(\d+(?:\.\d+)?)\s*%/i,
  ];
  for (const re of patterns) {
    const m = promptText.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 100) return n;
    }
  }
  return DEFAULT_STOP_LOSS_PCT;
}

function holdWindowDays(turnoverPreference: string | null): number {
  const t = (turnoverPreference ?? "").toLowerCase();
  if (t === "high") return 10;
  if (t === "low") return 60;
  return 20; // Moderate / unset
}

function toSimBars(bars: BenchmarkBar[]): SimBar[] {
  return bars.map((b) => ({ date: b.date, close: b.adjClose, volume: b.volume ?? null }));
}

function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? ((peak - v) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

function sharpeApprox(equity: number[]): number {
  if (equity.length < 3) return 0;
  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    if (equity[i - 1] > 0) dailyReturns.push(equity[i] / equity[i - 1] - 1);
  }
  if (dailyReturns.length === 0) return 0;
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return 0;
  return (mean / stddev) * Math.sqrt(252);
}

type OpenPosition = { ticker: string; entryDate: string; entryPrice: number; costBasis: number; daysHeld: number; peakPrice: number };

function runSimulation(
  tickerBars: Map<string, SimBar[]>,
  tradingDates: string[],
  params: { stopLossPct: number; positionSizePct: number; maxConcurrentPositions: number; holdWindow: number; scannerBounds: ScannerBounds | null }
) {
  const barIndexByTicker = new Map<string, Map<string, number>>();
  for (const [ticker, bars] of tickerBars) {
    const idx = new Map<string, number>();
    bars.forEach((b, i) => idx.set(b.date, i));
    barIndexByTicker.set(ticker, idx);
  }

  let cash = STARTING_EQUITY;
  const openPositions: OpenPosition[] = [];
  const closedTrades: Trade[] = [];
  const equityCurve: { date: string; value: number }[] = [];

  function barAt(ticker: string, date: string): SimBar | null {
    const bars = tickerBars.get(ticker);
    const idx = barIndexByTicker.get(ticker);
    if (!bars || !idx) return null;
    const i = idx.get(date);
    return i == null ? null : bars[i];
  }

  function barsBack(ticker: string, date: string, back: number): SimBar[] {
    const bars = tickerBars.get(ticker);
    const idx = barIndexByTicker.get(ticker);
    if (!bars || !idx) return [];
    const i = idx.get(date);
    if (i == null || i - back < 0) return [];
    return bars.slice(Math.max(0, i - back), i);
  }

  for (const date of tradingDates) {
    // 1. Mark-to-market check exits first: hard stop-loss always applies (cut
    // losers fast); winners are allowed to run past the normal hold window and
    // instead exit on a trailing stop from their peak (protects gains without
    // capping upside at a fixed day count).
    for (let i = openPositions.length - 1; i >= 0; i--) {
      const pos = openPositions[i];
      const bar = barAt(pos.ticker, date);
      if (!bar) continue;
      pos.daysHeld += 1;
      pos.peakPrice = Math.max(pos.peakPrice, bar.close);
      const pnlPct = ((bar.close - pos.entryPrice) / pos.entryPrice) * 100;
      const drawdownFromPeakPct = pos.peakPrice > 0 ? ((pos.peakPrice - bar.close) / pos.peakPrice) * 100 : 0;
      const isWinner = pnlPct >= WINNER_THRESHOLD_PCT;

      const shouldHardStop = pnlPct <= -params.stopLossPct;
      const shouldTrailingStop = isWinner && drawdownFromPeakPct >= TRAILING_STOP_PCT;
      const shouldTimeExit = !isWinner && pos.daysHeld >= params.holdWindow;
      const shouldMaxHoldExit = pos.daysHeld >= params.holdWindow * MAX_HOLD_MULTIPLIER;

      if (shouldHardStop || shouldTrailingStop || shouldTimeExit || shouldMaxHoldExit) {
        const grossProceeds = pos.costBasis * (1 + pnlPct / 100);
        const exitFee = grossProceeds * (TRANSACTION_COST_PCT / 100);
        cash += grossProceeds - exitFee;
        const netPnlPct = pnlPct - 2 * TRANSACTION_COST_PCT; // entry + exit fee, approximated on notional
        closedTrades.push({ entryDate: pos.entryDate, exitDate: date, pnlPct: netPnlPct });
        openPositions.splice(i, 1);
      }
    }

    // 2. Look for new entries if slots are open — rank same-day candidates by
    // signal strength (5-day return) so limited slots go to the strongest
    // setups first, rather than whichever ticker happens to iterate first.
    if (openPositions.length < params.maxConcurrentPositions) {
      const held = new Set(openPositions.map((p) => p.ticker));
      const candidates: { ticker: string; bar: SimBar; fiveDayReturn: number }[] = [];

      for (const ticker of tickerBars.keys()) {
        if (held.has(ticker)) continue;
        const bar = barAt(ticker, date);
        const past = barsBack(ticker, date, 20);
        if (!bar || past.length < 20) continue;
        const bar5 = past[past.length - 5];
        if (!bar5 || bar5.close <= 0) continue;
        const fiveDayReturn = ((bar.close - bar5.close) / bar5.close) * 100;
        if (fiveDayReturn <= SIGNAL_5D_RETURN_PCT) continue;

        const avgVol20 = past.reduce((s, b) => s + (b.volume ?? 0), 0) / past.length;
        const volumeOk = bar.volume == null || avgVol20 === 0 || bar.volume > VOLUME_MULTIPLE * avgVol20;
        if (!volumeOk) continue;

        if (params.scannerBounds?.min_avg_dollar_volume) {
          const avgDollarVol20 = past.reduce((s, b) => s + (b.volume ?? 0) * b.close, 0) / past.length;
          if (avgDollarVol20 < params.scannerBounds.min_avg_dollar_volume) continue;
        }
        if (params.scannerBounds?.max_daily_move_pct != null) {
          const prevBar = past[past.length - 1];
          const todayMovePct = prevBar && prevBar.close > 0 ? ((bar.close - prevBar.close) / prevBar.close) * 100 : 0;
          if (todayMovePct > params.scannerBounds.max_daily_move_pct) continue;
        }

        candidates.push({ ticker, bar, fiveDayReturn });
      }

      candidates.sort((a, b) => b.fiveDayReturn - a.fiveDayReturn);

      for (const candidate of candidates) {
        if (openPositions.length >= params.maxConcurrentPositions) break;

        const currentEquity = cash + openPositions.reduce((s, p) => {
          const b = barAt(p.ticker, date);
          const pnl = b ? ((b.close - p.entryPrice) / p.entryPrice) : 0;
          return s + p.costBasis * (1 + pnl);
        }, 0);
        const allocation = Math.min(cash, currentEquity * (params.positionSizePct / 100));
        if (allocation <= 0) continue;

        const entryFee = allocation * (TRANSACTION_COST_PCT / 100);
        cash -= allocation + entryFee;
        openPositions.push({ ticker: candidate.ticker, entryDate: date, entryPrice: candidate.bar.close, costBasis: allocation, daysHeld: 0, peakPrice: candidate.bar.close });
      }
    }

    // 3. Mark total equity for the day
    const positionsValue = openPositions.reduce((s, p) => {
      const b = barAt(p.ticker, date);
      const pnl = b ? (b.close - p.entryPrice) / p.entryPrice : 0;
      return s + p.costBasis * (1 + pnl);
    }, 0);
    equityCurve.push({ date, value: cash + positionsValue });
  }

  return { equityCurve, closedTrades };
}

function buildCurveAndStats(
  spyBars: BenchmarkBar[],
  equityCurve: { date: string; value: number }[],
  closedTrades: Trade[]
) {
  const spyBase = spyBars[0].adjClose;
  const equityByDate = new Map(equityCurve.map((e) => [e.date, e.value]));
  const curve = spyBars.map((b) => ({
    date: b.date,
    value: equityByDate.get(b.date) ?? STARTING_EQUITY,
    benchmark: spyBase > 0 ? (b.adjClose / spyBase) * STARTING_EQUITY : STARTING_EQUITY,
  }));

  const finalValue = curve[curve.length - 1]?.value ?? STARTING_EQUITY;
  const finalBenchmark = curve[curve.length - 1]?.benchmark ?? STARTING_EQUITY;
  const wins = closedTrades.filter((t) => t.pnlPct > 0);
  const losses = closedTrades.filter((t) => t.pnlPct <= 0);

  const stats = {
    total_return_pct: finalValue - STARTING_EQUITY,
    benchmark_return_pct: finalBenchmark - STARTING_EQUITY,
    max_drawdown_pct: maxDrawdown(curve.map((c) => c.value)),
    win_rate_pct: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
    avg_win_pct: wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0,
    avg_loss_pct: losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0,
    trade_count: closedTrades.length,
    sharpe_approx: sharpeApprox(curve.map((c) => c.value)),
  };

  return { curve, stats };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { limited, retryAfter } = checkRateLimit(`strategies-backtest:${user.id}`, 6, 5 * 60_000);
  if (limited) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

  let body: BacktestRequest;
  try {
    body = await req.json() as BacktestRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { strategy_id, lookback, save, sweep } = body;
  const validLookbacks: RangeKey[] = ["1Y", "3Y", "5Y"];
  const range: RangeKey = validLookbacks.includes(lookback) ? lookback : "1Y";

  const { data: strategy, error: strategyErr } = await supabase
    .from("strategies").select("id, name").eq("id", strategy_id).eq("user_id", user.id).single();
  if (strategyErr || !strategy) return NextResponse.json({ error: "Strategy not found." }, { status: 404 });

  const { data: version, error: versionErr } = await supabase
    .from("strategy_versions")
    .select("prompt_text, max_position_pct, cash_min_pct, turnover_preference, scanner_bounds_json")
    .eq("strategy_id", strategy_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  if (versionErr || !version) return NextResponse.json({ error: "No strategy version found." }, { status: 404 });

  const stopLossPct = parseStopLossPct(version.prompt_text);
  const positionSizePct = Math.min(Math.max(version.max_position_pct ?? 20, 5), 50);
  const cashFloorPct = version.cash_min_pct ?? 5;
  const maxConcurrentPositions = Math.min(10, Math.max(1, Math.floor((100 - cashFloorPct) / positionSizePct)));
  const holdWindow = holdWindowDays(version.turnover_preference);
  const scannerBounds = (version.scanner_bounds_json as ScannerBounds | null) ?? null;

  try {
    const spyBars = await getBenchmarkHistory("SPY", range, false, false);
    const universeBars = await fetchInBatches(
      [...BACKTEST_UNIVERSE],
      FETCH_BATCH_SIZE,
      (t) => getBenchmarkHistory(t, range, false, false)
    );

    if (spyBars.length < 30) {
      return NextResponse.json({ error: "Not enough benchmark data to run a backtest right now." }, { status: 502 });
    }

    const tradingDates = spyBars.map((b) => b.date);
    const tickerBars = new Map<string, SimBar[]>();
    BACKTEST_UNIVERSE.forEach((ticker, i) => {
      const bars = universeBars[i];
      if (bars && bars.length >= 30) tickerBars.set(ticker, toSimBars(bars));
    });

    if (tickerBars.size < 10) {
      return NextResponse.json({ error: "Not enough market data available across the universe right now — try again shortly." }, { status: 502 });
    }

    // ── Parameter sweep: same fetched data, several stop-loss values ──
    if (sweep) {
      const sweepResults = SWEEP_STOP_LOSS_VALUES.map((sweepStopLoss) => {
        const { equityCurve, closedTrades } = runSimulation(tickerBars, tradingDates, {
          stopLossPct: sweepStopLoss,
          positionSizePct,
          maxConcurrentPositions,
          holdWindow,
          scannerBounds,
        });
        const { stats } = buildCurveAndStats(spyBars, equityCurve, closedTrades);
        return {
          stop_loss_pct: sweepStopLoss,
          is_current: sweepStopLoss === stopLossPct,
          total_return_pct: stats.total_return_pct,
          max_drawdown_pct: stats.max_drawdown_pct,
          sharpe_approx: stats.sharpe_approx,
          trade_count: stats.trade_count,
        };
      });

      return NextResponse.json({ sweep_result: { values: sweepResults, lookback: range, current_stop_loss_pct: stopLossPct } });
    }

    // ── Single run ──
    const { equityCurve, closedTrades } = runSimulation(tickerBars, tradingDates, {
      stopLossPct,
      positionSizePct,
      maxConcurrentPositions,
      holdWindow,
      scannerBounds,
    });

    const { curve, stats } = buildCurveAndStats(spyBars, equityCurve, closedTrades);
    const regimeByDate = classifyRegimes(spyBars);
    const regimeBreakdown = summarizeByRegime(curve, closedTrades, regimeByDate);

    const params = {
      stop_loss_pct: stopLossPct,
      position_size_pct: positionSizePct,
      max_concurrent_positions: maxConcurrentPositions,
      hold_window_days: holdWindow,
      universe_size: tickerBars.size,
    };

    let savedRunId: string | null = null;
    if (save) {
      const { data: inserted, error: insertErr } = await supabase
        .from("strategy_backtests")
        .insert({
          user_id: user.id,
          strategy_id,
          strategy_name: strategy.name,
          lookback: range,
          params_json: params,
          stats_json: stats,
          equity_curve_json: curve,
        })
        .select("id")
        .single();
      if (!insertErr && inserted) savedRunId = inserted.id as string;
    }

    return NextResponse.json({
      result: {
        equity_curve: curve,
        stats,
        regime_breakdown: regimeBreakdown,
        universe_size: tickerBars.size,
        lookback: range,
        stop_loss_pct: stopLossPct,
        position_size_pct: positionSizePct,
        max_concurrent_positions: maxConcurrentPositions,
        hold_window_days: holdWindow,
        disclaimer: DISCLAIMER,
        saved_run_id: savedRunId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const strategyId = req.nextUrl.searchParams.get("strategy_id");
  const runId = req.nextUrl.searchParams.get("run_id");

  if (runId) {
    const { data, error } = await supabase
      .from("strategy_backtests")
      .select("id, strategy_id, strategy_name, lookback, params_json, stats_json, equity_curve_json, created_at")
      .eq("id", runId).eq("user_id", user.id).single();
    if (error || !data) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    return NextResponse.json({ run: data });
  }

  if (!strategyId) return NextResponse.json({ error: "strategy_id is required." }, { status: 400 });

  const { data, error } = await supabase
    .from("strategy_backtests")
    .select("id, lookback, params_json, stats_json, created_at")
    .eq("strategy_id", strategyId).eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ runs: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const runId = req.nextUrl.searchParams.get("run_id");
  if (!runId) return NextResponse.json({ error: "run_id is required." }, { status: 400 });

  const { error } = await supabase
    .from("strategy_backtests")
    .delete()
    .eq("id", runId).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
