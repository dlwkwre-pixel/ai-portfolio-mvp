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
 * Remove an outlier first snapshot that would corrupt TWR.
 *
 * If the earliest snapshot's value is 5× or more than the median of the
 * next 1–4 snapshots, and there is no large cash flow in the ledger that
 * explains the gap, it was almost certainly captured while the user was
 * still setting up their portfolio (wrong shares / cost basis / cash).
 * Dropping it makes the chart start from the first "sane" data point.
 */
function sanitizeSnapshots(
  snapshots: { snapshot_date: string; total_value: number }[],
  cashFlows: CashFlowRow[]
): { snapshot_date: string; total_value: number }[] {
  if (snapshots.length < 2) return snapshots;

  const first = snapshots[0];
  // Build comparison set from the next 1-4 snapshots
  const peers = snapshots.slice(1, Math.min(5, snapshots.length));
  const peerValues = peers.map((s) => s.total_value).filter((v) => v > 0);
  if (peerValues.length === 0) return snapshots;

  const sorted = [...peerValues].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return snapshots;

  const ratio = first.total_value / median;

  // Drop partial first snapshots where only a small slice of the portfolio
  // existed yet (< 10% of the eventual median) — these are typically the
  // first weekly reconstruction point when only 1-2 holdings had been purchased.
  if (ratio < 0.1) return snapshots.slice(1);

  // Drop extreme outliers (≥5× or ≤1/5× the subsequent median)
  if (ratio < 5 && ratio > 0.2) return snapshots;

  // Check whether a large cash flow explains the gap
  const firstDate = toDateKey(first.snapshot_date);
  const secondDate = toDateKey(snapshots[1].snapshot_date);
  let windowFlow = 0;
  for (const cf of cashFlows) {
    const d = toDateKey(cf.effective_at);
    if (d >= firstDate && d <= secondDate) {
      const amt = Number(cf.amount ?? 0);
      windowFlow += (cf.direction || "").toUpperCase() === "OUT" ? -amt : amt;
    }
  }

  // If cash flows explain most of the gap, keep the snapshot
  const gap = Math.abs(first.total_value - median);
  if (Math.abs(windowFlow) >= gap * 0.7) return snapshots;

  // Drop the outlier first snapshot
  return snapshots.slice(1);
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

  const rawSnapshots = [...args.snapshots]
    .map((s) => ({
      snapshot_date: s.snapshot_date,
      total_value: Number(s.total_value),
    }))
    .filter((s) => Number.isFinite(s.total_value) && s.total_value > 0)
    .sort((a, b) => new Date(a.snapshot_date).getTime() - new Date(b.snapshot_date).getTime());

  const snapshots = sanitizeSnapshots(rawSnapshots, cashFlows);

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

  let benchmarkBars: BenchmarkBar[] = [];
  try {
    benchmarkBars = await getBenchmarkHistory(benchmarkSymbol, "MAX", true);
  } catch {
    benchmarkBars = [];
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
  // Uses netInvested when available so the baseline isn't distorted by the tiny
  // first snapshot value (which only captures the earliest-purchased holding).
  const portfolioReturnPct = netInvested > 0
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
    // Return on invested capital up to this point in time
    const snapshotDate = toDateKey(snapshot.snapshot_date);
    const deployedUpTo = deployedCapitalUpTo(snapshotDate);
    const portfolioReturn = deployedUpTo > 0
      ? ((snapshot.total_value - deployedUpTo) / deployedUpTo) * 100
      : firstPortfolioValue > 0
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

  // Normalize both return lines to start at 0% so the chart always begins flat.
  // The raw first-point return can be non-zero when the earliest snapshot's value
  // doesn't exactly match the deployed capital (e.g. price differences between
  // purchase dates and weekly reconstruction points).
  if (chartData.length > 0) {
    const returnOffset = chartData[0].portfolio_return_pct;
    const twrOffset = chartData[0].portfolio_twr_pct;
    if (Math.abs(returnOffset) > 0.001 || Math.abs(twrOffset) > 0.001) {
      for (let i = 0; i < chartData.length; i++) {
        chartData[i] = {
          ...chartData[i],
          portfolio_return_pct: chartData[i].portfolio_return_pct - returnOffset,
          portfolio_twr_pct: chartData[i].portfolio_twr_pct - twrOffset,
        };
      }
    }
  }

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
    netInvested: netInvested > 0 ? netInvested : null,
  };
}

export async function getBenchmarkIndexedSeries(
  symbol: string = "SPY",
  range: RangeKey = "1Y"
) {
  const bars = await getBenchmarkHistory(symbol, range, true);
  return toIndexedSeries(bars);
}
