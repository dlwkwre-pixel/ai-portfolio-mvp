import { getBenchmarkHistory, toIndexedSeries } from "@/lib/market-data/finnhub-benchmark";
import type { BenchmarkBar, RangeKey } from "@/lib/market-data/type";

type SnapshotRow = {
  snapshot_date: string;
  total_value: number | string;
};

type CashFlowRow = {
  effective_at: string;
  direction: string | null;
  amount: number | string;
};

export type BenchmarkChartPoint = {
  date: string;
  portfolio_return_pct: number;       // simple return (includes deposits)
  portfolio_twr_pct: number;          // time-weighted return (excludes deposits)
  benchmark_return_pct: number | null;
};

export type BenchmarkComparisonResult = {
  benchmarkSymbol: string;
  startDateLabel: string | null;
  endDateLabel: string | null;
  portfolioReturnPct: number | null;        // simple return
  portfolioTwrPct: number | null;           // time-weighted return
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  excessTwrPct: number | null;
  chartData: BenchmarkChartPoint[];
  hasEnoughSnapshots: boolean;
  benchmarkAvailable: boolean;
};

function toDateKey(dateString: string): string {
  return new Date(dateString).toISOString().slice(0, 10);
}

function toDisplayDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString();
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
}): Promise<BenchmarkComparisonResult> {
  const benchmarkSymbol = args.benchmarkSymbol?.trim().toUpperCase() || "SPY";
  const cashFlows = args.cashFlows ?? [];

  const snapshots = [...args.snapshots]
    .map((s) => ({
      snapshot_date: s.snapshot_date,
      total_value: Number(s.total_value),
    }))
    .filter((s) => Number.isFinite(s.total_value) && s.total_value > 0)
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime());

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
    };
  }

  const firstSnapshot = snapshots[0];
  const lastSnapshot = snapshots[snapshots.length - 1];

  let benchmarkBars: BenchmarkBar[] = [];
  try {
    benchmarkBars = await getBenchmarkHistory(benchmarkSymbol, "MAX", true);
  } catch {
    benchmarkBars = [];
  }

  const benchmarkAvailable = benchmarkBars.length > 0;
  const firstPortfolioValue = firstSnapshot.total_value;
  const lastPortfolioValue = lastSnapshot.total_value;

  // Simple return (includes deposits — good for total wealth tracking)
  const portfolioReturnPct = firstPortfolioValue > 0
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

  // Build chart data with both return series
  // For TWR chart we use running TWR up to each snapshot
  const chartData: BenchmarkChartPoint[] = snapshots.map((snapshot, idx) => {
    // Simple return up to this point
    const portfolioReturn = firstPortfolioValue > 0
      ? ((snapshot.total_value - firstPortfolioValue) / firstPortfolioValue) * 100
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
      date: toDisplayDate(snapshot.snapshot_date),
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
  };
}

export async function getBenchmarkIndexedSeries(
  symbol: string = "SPY",
  range: RangeKey = "1Y"
) {
  const bars = await getBenchmarkHistory(symbol, range, true);
  return toIndexedSeries(bars);
}
