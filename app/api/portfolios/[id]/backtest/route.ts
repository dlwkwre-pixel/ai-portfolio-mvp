import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getBenchmarkHistory } from "@/lib/market-data/finnhub-benchmark";
import type { BenchmarkBar, RangeKey } from "@/lib/market-data/type";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const START_VALUE = 10_000;
const VALID_RANGES: RangeKey[] = ["1Y", "3Y", "5Y", "MAX"];

// adjClose as of a date (last bar on/before the date), via a sorted-bars cursor.
function priceAsOf(bars: BenchmarkBar[], date: string): number | null {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= date) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans >= 0 ? bars[ans].adjClose : null;
}

function maxDrawdown(series: number[]): number {
  let peak = -Infinity, mdd = 0;
  for (const v of series) {
    if (v > peak) peak = v;
    if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd; // negative
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: portfolio } = await supabase
    .from("portfolios").select("id, cash_balance, benchmark_symbol").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rangeParam = (req.nextUrl.searchParams.get("range") ?? "3Y").toUpperCase() as RangeKey;
  const range: RangeKey = VALID_RANGES.includes(rangeParam) ? rangeParam : "3Y";
  const benchmarkSymbol = (portfolio.benchmark_symbol as string) || "SPY";

  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .eq("portfolio_id", id);
  const rows = (holdings ?? []).filter((h) => h.asset_type !== "manual" && h.asset_type !== "crypto");
  if (rows.length === 0) return NextResponse.json({ available: false, reason: "No tradeable holdings to backtest." });

  // Current weights from live valuation → the allocation we replay through history.
  let valued: { ticker: string; market_value: number }[] = [];
  try {
    const val = await getPortfolioValuation({
      holdings: rows.map((h) => ({ id: h.id, ticker: h.ticker, company_name: h.company_name, asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis, manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at })),
      cashBalance: 0,
    });
    valued = val.valued_holdings.filter((h) => (h.market_value ?? 0) > 0).map((h) => ({ ticker: h.ticker, market_value: h.market_value ?? 0 }));
  } catch { /* fall through */ }
  if (valued.length === 0) return NextResponse.json({ available: false, reason: "Couldn't value holdings right now." });

  // Top 12 by value, weights renormalized among them.
  const top = valued.sort((a, b) => b.market_value - a.market_value).slice(0, 12);
  const wTotal = top.reduce((s, h) => s + h.market_value, 0);
  const weights = new Map(top.map((h) => [h.ticker, h.market_value / wTotal]));
  const coverage = Math.round((wTotal / valued.reduce((s, h) => s + h.market_value, 0)) * 100);

  // Fetch dividend-adjusted history for each ticker + the benchmark.
  const histories = await Promise.all([...weights.keys()].map(async (t) => {
    try {
      const bars = await getBenchmarkHistory(t, range, true, false);
      return bars.length >= 2 ? ({ ticker: t, bars } as { ticker: string; bars: BenchmarkBar[] }) : null;
    } catch { return null; }
  }));
  const ok = histories.filter((h): h is { ticker: string; bars: BenchmarkBar[] } => h != null);
  if (ok.length < 1) return NextResponse.json({ available: false, reason: "Not enough price history for these holdings." });

  let benchBars: BenchmarkBar[] = [];
  try { benchBars = await getBenchmarkHistory(benchmarkSymbol, range, true, false); } catch { /* ignore */ }

  // Common start = latest first-date among covered tickers (so every name has data).
  const startDate = ok.map((h) => h.bars[0].date).sort().slice(-1)[0];
  const endDate = ok.map((h) => h.bars[h.bars.length - 1].date).sort()[0];
  // Renormalize weights across the tickers we actually have history for.
  const covWeight = ok.reduce((s, h) => s + (weights.get(h.ticker) ?? 0), 0);
  if (covWeight <= 0) return NextResponse.json({ available: false, reason: "Not enough price history for these holdings." });

  // Sample dates ~monthly from the benchmark's bar dates within [start, end].
  const grid = (benchBars.length ? benchBars : ok[0].bars)
    .filter((b) => b.date >= startDate && b.date <= endDate)
    .map((b) => b.date);
  const step = Math.max(1, Math.floor(grid.length / 60));
  const sampleDates = grid.filter((_, i) => i % step === 0);
  if (sampleDates.length && sampleDates[sampleDates.length - 1] !== endDate) sampleDates.push(endDate);
  if (sampleDates.length < 2) return NextResponse.json({ available: false, reason: "Not enough overlapping history." });

  // Shares bought at the start for each ticker (buy-and-hold the current allocation).
  const startPrice = new Map<string, number>();
  for (const h of ok) {
    const p = priceAsOf(h.bars, startDate);
    if (p && p > 0) startPrice.set(h.ticker, p);
  }
  const shares = new Map<string, number>();
  for (const h of ok) {
    const w = (weights.get(h.ticker) ?? 0) / covWeight; // renormalized
    const sp = startPrice.get(h.ticker);
    if (sp) shares.set(h.ticker, (w * START_VALUE) / sp);
  }

  const portfolioSeries: { date: string; value: number }[] = [];
  for (const d of sampleDates) {
    let v = 0;
    for (const h of ok) {
      const sh = shares.get(h.ticker);
      const p = priceAsOf(h.bars, d);
      if (sh && p) v += sh * p;
    }
    portfolioSeries.push({ date: d, value: Math.round(v) });
  }

  let benchSeries: { date: string; value: number }[] = [];
  if (benchBars.length) {
    const bStart = priceAsOf(benchBars, startDate);
    if (bStart && bStart > 0) {
      benchSeries = sampleDates.map((d) => {
        const p = priceAsOf(benchBars, d);
        return { date: d, value: p ? Math.round((p / bStart) * START_VALUE) : START_VALUE };
      });
    }
  }

  const pVals = portfolioSeries.map((s) => s.value);
  const years = Math.max(0.25, (new Date(endDate).getTime() - new Date(startDate).getTime()) / (365.25 * 86_400_000));
  const pEnd = pVals[pVals.length - 1];
  const portfolioReturn = pEnd / START_VALUE - 1;
  const portfolioCagr = Math.pow(pEnd / START_VALUE, 1 / years) - 1;
  const portfolioMdd = maxDrawdown(pVals);

  let benchmark = null;
  if (benchSeries.length) {
    const bEnd = benchSeries[benchSeries.length - 1].value;
    benchmark = {
      symbol: benchmarkSymbol,
      endValue: bEnd,
      totalReturn: bEnd / START_VALUE - 1,
      cagr: Math.pow(bEnd / START_VALUE, 1 / years) - 1,
      maxDrawdown: maxDrawdown(benchSeries.map((s) => s.value)),
      series: benchSeries,
    };
  }

  return NextResponse.json({
    available: true,
    range,
    startDate,
    endDate,
    startValue: START_VALUE,
    coveragePct: coverage,
    tickersUsed: ok.length,
    tickersTotal: valued.length,
    portfolio: {
      endValue: pEnd,
      totalReturn: portfolioReturn,
      cagr: portfolioCagr,
      maxDrawdown: portfolioMdd,
      series: portfolioSeries,
    },
    benchmark,
  });
}
