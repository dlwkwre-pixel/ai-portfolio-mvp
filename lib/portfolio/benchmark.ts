import { getBenchmarkHistory, toIndexedSeries } from "@/lib/market-data/finnhub-benchmark";
import type { BenchmarkBar, RangeKey } from "@/lib/market-data/type";

type SnapshotRow = {
  snapshot_date: string;
  total_value: number | string;
};

export type BenchmarkChartPoint = {
  date: string;
  portfolio_return_pct: number;
  benchmark_return_pct: number | null;
};

export type BenchmarkComparisonResult = {
  benchmarkSymbol: string;
  startDateLabel: string | null;
  endDateLabel: string | null;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
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

export async function getBenchmarkComparison(args: {
  snapshots: SnapshotRow[];
  benchmarkSymbol: string;
}): Promise<BenchmarkComparisonResult> {
  const benchmarkSymbol = args.benchmarkSymbol?.trim().toUpperCase() || "SPY";

  const snapshots = [...args.snapshots]
    .map((snapshot) => ({
      snapshot_date: snapshot.snapshot_date,
      total_value: Number(snapshot.total_value),
    }))
    .filter((snapshot) => Number.isFinite(snapshot.total_value) && snapshot.total_value > 0)
    .sort(
      (a, b) =>
        new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime()
    );

  if (snapshots.length < 2) {
    return {
      benchmarkSymbol,
      startDateLabel: snapshots[0] ? toDisplayDate(snapshots[0].snapshot_date) : null,
      endDateLabel:
        snapshots.length > 0
          ? toDisplayDate(snapshots[snapshots.length - 1].snapshot_date)
          : null,
      portfolioReturnPct: null,
      benchmarkReturnPct: null,
      excessReturnPct: null,
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

  const portfolioReturnPct =
    firstPortfolioValue > 0
      ? ((lastPortfolioValue - firstPortfolioValue) / firstPortfolioValue) * 100
      : null;

  const firstBenchmarkClose = benchmarkAvailable
    ? findAdjCloseOnOrBefore(toDateKey(firstSnapshot.snapshot_date), benchmarkBars)
    : null;

  const lastBenchmarkClose = benchmarkAvailable
    ? findAdjCloseOnOrBefore(toDateKey(lastSnapshot.snapshot_date), benchmarkBars)
    : null;

  const benchmarkReturnPct =
    firstBenchmarkClose !== null &&
    lastBenchmarkClose !== null &&
    firstBenchmarkClose > 0
      ? ((lastBenchmarkClose - firstBenchmarkClose) / firstBenchmarkClose) * 100
      : null;

  const excessReturnPct =
    portfolioReturnPct !== null && benchmarkReturnPct !== null
      ? portfolioReturnPct - benchmarkReturnPct
      : null;

  const chartData: BenchmarkChartPoint[] = snapshots.map((snapshot) => {
    const portfolioReturn =
      firstPortfolioValue > 0
        ? ((snapshot.total_value - firstPortfolioValue) / firstPortfolioValue) * 100
        : 0;

    const benchmarkClose = benchmarkAvailable
      ? findAdjCloseOnOrBefore(toDateKey(snapshot.snapshot_date), benchmarkBars)
      : null;

    const benchmarkReturn =
      benchmarkClose !== null &&
      firstBenchmarkClose !== null &&
      firstBenchmarkClose > 0
        ? ((benchmarkClose - firstBenchmarkClose) / firstBenchmarkClose) * 100
        : null;

    return {
      date: toDisplayDate(snapshot.snapshot_date),
      portfolio_return_pct: portfolioReturn,
      benchmark_return_pct: benchmarkReturn,
    };
  });

  return {
    benchmarkSymbol,
    startDateLabel: toDisplayDate(firstSnapshot.snapshot_date),
    endDateLabel: toDisplayDate(lastSnapshot.snapshot_date),
    portfolioReturnPct,
    benchmarkReturnPct,
    excessReturnPct,
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