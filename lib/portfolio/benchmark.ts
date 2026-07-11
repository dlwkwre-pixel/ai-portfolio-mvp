import { createClient as createSbClient } from "@supabase/supabase-js";
import { getBenchmarkHistory, toIndexedSeries } from "@/lib/market-data/finnhub-benchmark";
import type { BenchmarkBar, RangeKey } from "@/lib/market-data/type";

// Durable benchmark cache (chart_cache table). The benchmark (SPY) is fetched on every
// portfolio render and shares the price-API quota with the linked-portfolio reconstruction
// (many tickers). When that quota is briefly exhausted the SPY fetch returns empty and the
// line/stat vanish ("—"); falling back to the last good bars keeps it steady. Fails open.
function benchAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSbClient(url, key, { auth: { persistSession: false } });
}
async function getCachedBenchmark(symbol: string, allowStale = false): Promise<BenchmarkBar[] | null> {
  const db = benchAdmin();
  if (!db) return null;
  try {
    const { data } = await db.from("chart_cache").select("result, expires_at").eq("cache_key", `bench:${symbol}`).single();
    if (!data) return null;
    if (!allowStale && new Date(data.expires_at as string) <= new Date()) return null;
    const bars = (data.result as { bars?: BenchmarkBar[] })?.bars;
    return Array.isArray(bars) && bars.length > 0 ? bars : null;
  } catch {
    return null;
  }
}
async function setCachedBenchmark(symbol: string, bars: BenchmarkBar[]): Promise<void> {
  const db = benchAdmin();
  if (!db || bars.length === 0) return;
  try {
    await db.from("chart_cache").upsert(
      { cache_key: `bench:${symbol}`, result: { bars }, expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "cache_key" },
    );
  } catch { /* non-fatal */ }
}

type SnapshotRow = {
  snapshot_date: string;
  total_value: number | string;
};

type CashFlowRow = {
  effective_at: string;
  direction: string | null;
  amount: number | string;
  reason?: string | null;
};

// A dividend (or interest) is investment INCOME, not an external contribution, so it
// must stay in the return, not be netted out like a deposit. Any flow whose reason is
// investment income is excluded from the cash-flow set the TWR/net-invested math removes.
// Rows without a reason are treated as external (the safe default for legacy data).
export function isExternalCashFlow(reason: string | null | undefined): boolean {
  const r = (reason ?? "").toLowerCase();
  return r !== "dividend" && r !== "interest";
}

export type BenchmarkChartPoint = {
  date: string;
  portfolio_value: number;            // absolute portfolio value in dollars
  portfolio_return_pct: number;       // simple return (includes deposits)
  portfolio_twr_pct: number;          // time-weighted return (excludes deposits)
  benchmark_return_pct: number | null;
};

export type BenchmarkComparisonResult = {
  benchmarkSymbol: string;
  startDateLabel: string | null;
  endDateLabel: string | null;
  portfolioReturnPct: number | null;        // simple return on invested capital
  portfolioTwrPct: number | null;           // time-weighted return
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  excessTwrPct: number | null;
  chartData: BenchmarkChartPoint[];
  hasEnoughSnapshots: boolean;
  benchmarkAvailable: boolean;
  netInvested: number | null;               // total capital deployed (sum IN - sum OUT)
};

function toDateKey(dateString: string): string {
  return new Date(dateString).toISOString().slice(0, 10);
}

/**
 * Determine the chart start date: the first snapshot on or after the date
 * when every current holding had been purchased at least once.
 *
 * Why: reconstruction builds weekly snapshots from the earliest lot purchase
 * date. If holdings were bought at different times, early snapshots only
 * capture a fraction of the portfolio — MSFT is missing until you bought it,
 * AAPL is missing until you bought it, etc. The chart ramps up not because of
 * market returns but because capital is still being deployed.
 *
 * The fix: each holding contributes its earliest purchase date. The chart
 * starts at max(those dates) — the point when the last holding entered the
 * portfolio. From there, every current holding is represented in every
 * snapshot, so comparisons are apples-to-apples.
 *
 * totalCostBasis: if provided, snapshots with value < 10% of cost basis are
 * treated as reconstruction noise and trimmed. This catches the case where
 * reconstructPortfolioChart generated early near-zero snapshots before all
 * holdings had price data.
 */
export function sanitizeSnapshots(
  snapshots: { snapshot_date: string; total_value: number }[],
  totalCostBasis?: number
): { snapshot_date: string; total_value: number }[] {
  if (snapshots.length < 2) return snapshots;

  if (totalCostBasis && totalCostBasis > 0) {
    // Trim leading reconstruction ramp-up: find the first snapshot where the
    // portfolio value reaches at least 50% of cost basis, then drop everything
    // before it. This removes the near-zero early snapshots generated by
    // reconstructPortfolioChart without touching real mid-chart dips.
    const threshold = totalCostBasis * 0.5;
    const firstValidIdx = snapshots.findIndex((s) => s.total_value >= threshold);
    if (firstValidIdx > 0) {
      const trimmed = snapshots.slice(firstValidIdx);
      if (trimmed.length >= 2) return trimmed;
    }
  }

  return snapshots;
}

function toDisplayDate(dateString: string): string {
  // Use toDateKey (YYYY-MM-DD) — avoids locale-format parsing issues in the client
  // and prevents UTC midnight from shifting to the previous day in US timezones.
  return toDateKey(dateString);
}

function findAdjCloseOnOrBefore(targetDate: string, bars: BenchmarkBar[]): number | null {
  let matched: BenchmarkBar | null = null;
  for (const bar of bars) {
    if (bar.date <= targetDate) {
      matched = bar;
    } else {
      break;
    }
  }
  return matched?.adjClose ?? null;
}

/**
 * Calculate Time-Weighted Return (TWR)
 *
 * TWR eliminates the effect of external cash flows (deposits/withdrawals).
 * For each sub-period between snapshots, we calculate the holding period return.
 * If a cash flow occurred between two snapshots, we adjust the starting value.
 *
 * Formula: TWR = (1+r1) × (1+r2) × ... × (1+rN) - 1
 * Where each rN = (end_value - start_value - cash_flow) / (start_value + cash_flow_if_start)
 */
function calculateTwr(
  snapshots: { snapshot_date: string; total_value: number }[],
  cashFlows: CashFlowRow[]
): number | null {
  if (snapshots.length < 2) return null;

  // Build a map of cash flows by date
  const cashFlowByDate = new Map<string, number>();
  for (const cf of cashFlows) {
    const date = toDateKey(cf.effective_at);
    const amount = Number(cf.amount ?? 0);
    const signed = (cf.direction || "").toUpperCase() === "OUT" ? -amount : amount;
    cashFlowByDate.set(date, (cashFlowByDate.get(date) ?? 0) + signed);
  }

  let cumulativeTwr = 1;

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    const startValue = prev.total_value;
    const endValue = curr.total_value;

    // Sum cash flows that occurred between prev and curr snapshot dates
    const prevDate = toDateKey(prev.snapshot_date);
    const currDate = toDateKey(curr.snapshot_date);

    let periodCashFlow = 0;
    for (const [date, amount] of cashFlowByDate) {
      if (date > prevDate && date <= currDate) {
        periodCashFlow += amount;
      }
    }

    // Modified Dietz approximation for sub-period return
    // HPR = (End - Start - CashFlow) / (Start + CashFlow * 0.5)
    const denominator = startValue + periodCashFlow * 0.5;
    if (denominator <= 0) continue;

    const hpr = (endValue - startValue - periodCashFlow) / denominator;
    cumulativeTwr *= (1 + hpr);
  }

  return (cumulativeTwr - 1) * 100;
}

export async function getBenchmarkComparison(args: {
  snapshots: SnapshotRow[];
  benchmarkSymbol: string;
  cashFlows?: CashFlowRow[];
  /** Total cost basis from holdings (shares × avg cost basis). Most reliable return baseline. */
  totalCostBasis?: number;
}): Promise<BenchmarkComparisonResult> {
  const benchmarkSymbol = args.benchmarkSymbol?.trim().toUpperCase() || "SPY";
  // Keep only EXTERNAL flows (deposits/withdrawals/adjustments). Dividends and interest
  // are income and must count toward return, so they're dropped from the netting set.
  const cashFlows = (args.cashFlows ?? []).filter((cf) => isExternalCashFlow(cf.reason));

  const rawSnapshots = [...args.snapshots]
    .map((s) => ({ snapshot_date: s.snapshot_date, total_value: Number(s.total_value) }))
    .filter((s) => Number.isFinite(s.total_value) && s.total_value > 0)
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime());

  const snapshots = sanitizeSnapshots(rawSnapshots, args.totalCostBasis);

  if (snapshots.length < 2) {
    return {
      benchmarkSymbol,
      startDateLabel: snapshots[0] ? toDisplayDate(snapshots[0].snapshot_date) : null,
      endDateLabel: snapshots.length > 0 ? toDisplayDate(snapshots[snapshots.length - 1].snapshot_date) : null,
      portfolioReturnPct: null,
      portfolioTwrPct: null,
      benchmarkReturnPct: null,
      excessReturnPct: null,
      excessTwrPct: null,
      chartData: [],
      hasEnoughSnapshots: false,
      benchmarkAvailable: false,
      netInvested: null,
    };
  }

  const firstSnapshot = snapshots[0];
  const lastSnapshot = snapshots[snapshots.length - 1];

  const costBasis = args.totalCostBasis ?? 0;

  // If the first snapshot is a reconstruction artifact (value well below cost basis),
  // anchor the chart start at cost basis — the app already knows this from holdings data.
  // Only affects the chart visual; TWR still uses real snapshot values.
  const chartStartValue =
    costBasis > 0 && firstSnapshot.total_value < costBasis * 0.9
      ? costBasis
      : firstSnapshot.total_value;

  // Cache-first: the old code force-refetched the benchmark's full history on EVERY
  // portfolio render (bustCache), which burned the price API's daily quota — and once
  // exhausted, SPY vanished from every chart. Serve fresh cached bars (12h) when we have
  // them; fetch live only when the cache is cold; fall back to stale bars over nothing.
  let benchmarkBars: BenchmarkBar[] = (await getCachedBenchmark(benchmarkSymbol)) ?? [];
  if (benchmarkBars.length === 0) {
    try {
      benchmarkBars = await getBenchmarkHistory(benchmarkSymbol, "MAX", true);
    } catch {
      benchmarkBars = [];
    }
    if (benchmarkBars.length > 0) {
      void setCachedBenchmark(benchmarkSymbol, benchmarkBars);
    } else {
      const stale = await getCachedBenchmark(benchmarkSymbol, true);
      if (stale) benchmarkBars = stale;
    }
  }

  const benchmarkAvailable = benchmarkBars.length > 0;
  const firstPortfolioValue = firstSnapshot.total_value;
  const lastPortfolioValue = lastSnapshot.total_value;

  // Net invested capital = sum of IN cash flows minus OUT cash flows
  // This is the "how much did you actually put in" baseline for Total Return.
  const netInvested = cashFlows.reduce((sum, cf) => {
    const amount = Number(cf.amount ?? 0);
    const signed = (cf.direction ?? "").toUpperCase() === "OUT" ? -amount : amount;
    return sum + signed;
  }, 0);

  // Total Return = return on invested capital.
  // Priority: cost basis (most reliable) → netInvested from cash flows → first snapshot fallback.
  // Cost basis from holdings is always accurate regardless of snapshot quality.
  const portfolioReturnPct = costBasis > 0
    ? ((lastPortfolioValue - costBasis) / costBasis) * 100
    : netInvested > 0
    ? ((lastPortfolioValue - netInvested) / netInvested) * 100
    : firstPortfolioValue > 0
    ? ((lastPortfolioValue - firstPortfolioValue) / firstPortfolioValue) * 100
    : null;

  // Time-weighted return (excludes deposits — pure investment performance)
  const portfolioTwrPct = calculateTwr(snapshots, cashFlows);

  const firstBenchmarkClose = benchmarkAvailable
    ? findAdjCloseOnOrBefore(toDateKey(firstSnapshot.snapshot_date), benchmarkBars)
    : null;
  const lastBenchmarkClose = benchmarkAvailable
    ? findAdjCloseOnOrBefore(toDateKey(lastSnapshot.snapshot_date), benchmarkBars)
    : null;

  const benchmarkReturnPct =
    firstBenchmarkClose !== null && lastBenchmarkClose !== null && firstBenchmarkClose > 0
      ? ((lastBenchmarkClose - firstBenchmarkClose) / firstBenchmarkClose) * 100
      : null;

  const excessReturnPct =
    portfolioReturnPct !== null && benchmarkReturnPct !== null
      ? portfolioReturnPct - benchmarkReturnPct
      : null;

  const excessTwrPct =
    portfolioTwrPct !== null && benchmarkReturnPct !== null
      ? portfolioTwrPct - benchmarkReturnPct
      : null;

  // Pre-sort cash flows for the per-point deployed-capital calculation
  const sortedCashFlows = [...cashFlows].sort(
    (a, b) => new Date(a.effective_at).getTime() - new Date(b.effective_at).getTime()
  );

  function deployedCapitalUpTo(targetDate: string): number {
    let total = 0;
    for (const cf of sortedCashFlows) {
      if (toDateKey(cf.effective_at) <= targetDate) {
        const amount = Number(cf.amount ?? 0);
        total += (cf.direction ?? "").toUpperCase() === "OUT" ? -amount : amount;
      }
    }
    return total;
  }

  // Build chart data with both return series
  // For TWR chart we use running TWR up to each snapshot
  const chartData: BenchmarkChartPoint[] = snapshots.map((snapshot, idx) => {
    // For the first point, use chartStartValue (cost basis if reconstruction artifacts
    // were detected) so the chart anchors at the correct starting portfolio value.
    const displayValue = idx === 0 ? chartStartValue : snapshot.total_value;

    const chartBaseline = costBasis > 0 ? costBasis : firstPortfolioValue;
    const portfolioReturn = chartBaseline > 0
      ? ((displayValue - chartBaseline) / chartBaseline) * 100
      : 0;

    // TWR up to this point
    const twrUpToHere = idx === 0 ? 0 : calculateTwr(snapshots.slice(0, idx + 1), cashFlows) ?? 0;

    const benchmarkClose = benchmarkAvailable
      ? findAdjCloseOnOrBefore(toDateKey(snapshot.snapshot_date), benchmarkBars)
      : null;

    const benchmarkReturn =
      benchmarkClose !== null && firstBenchmarkClose !== null && firstBenchmarkClose > 0
        ? ((benchmarkClose - firstBenchmarkClose) / firstBenchmarkClose) * 100
        : null;

    return {
      date: snapshot.snapshot_date, // full timestamp — client deduplicates per timeframe
      portfolio_value: displayValue,
      portfolio_return_pct: portfolioReturn,
      portfolio_twr_pct: twrUpToHere,
      benchmark_return_pct: benchmarkReturn,
    };
  });

  return {
    benchmarkSymbol,
    startDateLabel: toDisplayDate(firstSnapshot.snapshot_date),
    endDateLabel: toDisplayDate(lastSnapshot.snapshot_date),
    portfolioReturnPct,
    portfolioTwrPct,
    benchmarkReturnPct,
    excessReturnPct,
    excessTwrPct,
    chartData,
    hasEnoughSnapshots: true,
    benchmarkAvailable,
    netInvested: costBasis > 0 ? costBasis : (netInvested > 0 ? netInvested : null),
  };
}

export async function getBenchmarkIndexedSeries(
  symbol: string = "SPY",
  range: RangeKey = "1Y"
) {
  const bars = await getBenchmarkHistory(symbol, range, true);
  return toIndexedSeries(bars);
}
