"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePortfolioPrivacy } from "./portfolio-privacy-context";
import ResetPerformanceButton from "./reset-performance-button";
import {
  CartesianGrid, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart,
} from "recharts";

type ChartDataPoint = {
  date: string;
  portfolio_value: number;
  portfolio_return_pct: number;
  portfolio_twr_pct: number;
  benchmark_return_pct: number | null;
};

type StatItem = {
  label: string;
  value: string;
  positive: boolean;
};

type PortfolioChartClientProps = {
  portfolioId: string;
  chartData: ChartDataPoint[];
  benchmarkSymbol: string;
  portfolioReturnPct: number | null;
  portfolioTwrPct: number | null;
  benchmarkReturnPct: number | null;
  excessReturnPct: number | null;
  excessTwrPct: number | null;
  startDateLabel: string | null;
  endDateLabel: string | null;
  hasEnoughSnapshots: boolean;
  netInvested: number | null;
  isLinked?: boolean;
  /** Linked portfolios: "same deposits in the benchmark" series for the comparison line. */
  benchMirror?: { date: string; value: number }[] | null;
  /** Linked portfolios: deposit-free growth index (base 100) for timeframe stats. */
  linkedTwrIndex?: { date: string; value: number }[] | null;
  holdings: { ticker: string; opened_at: string | null }[];
};

const TIMEFRAMES = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "YTD", days: -1 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
];

const CHART_MODES = [
  { label: "Net Return", value: "net" },
  { label: "Inv. Return", value: "twr" },
];

function filterByTimeframe<T extends { date: string }>(data: T[], days: number): T[] {
  if (days === 0) return data;
  const now = new Date();
  const cutoff = days === -1
    ? new Date(now.getFullYear(), 0, 1)
    : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return data.filter((d) => new Date(d.date.slice(0, 10) + "T12:00:00") >= cutoff);
}

function formatMoney(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function compactDate(value: string) {
  const d = new Date(value.slice(0, 10) + "T12:00:00");
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid var(--line-010)",
  borderRadius: "12px",
  color: "#ffffff",
  fontSize: "12px",
};

export default function PortfolioChartClient({
  portfolioId,
  chartData,
  benchmarkSymbol,
  portfolioReturnPct,
  portfolioTwrPct,
  benchmarkReturnPct,
  excessReturnPct,
  excessTwrPct,
  startDateLabel,
  endDateLabel,
  hasEnoughSnapshots,
  isLinked = false,
  benchMirror = null,
  linkedTwrIndex = null,
  holdings,
}: PortfolioChartClientProps) {
  const [activeTimeframe, setActiveTimeframe] = useState("All");
  // Linked (brokerage-synced) portfolios always use the value view: their chart line is
  // the real account value and the return is the broker's money-weighted total return.
  // The TWR-derived "Inv. Return" line double-counts deposits on a synced value series,
  // so we hide that toggle for linked portfolios.
  const [chartMode, setChartMode] = useState<"net" | "twr">("net");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillDone, setBackfillDone] = useState(false);
  const [removingBackfill, setRemovingBackfill] = useState(false);
  const [marketOpen, setMarketOpen] = useState<boolean | null>(null);
  const [marketSession, setMarketSession] = useState<string>("closed");

  useEffect(() => {
    fetch("/api/market/status")
      .then((r) => r.json())
      .then((d) => { setMarketOpen(d.isOpen); setMarketSession(d.session ?? "closed"); })
      .catch(() => {});
  }, []);
  const { isPrivate } = usePortfolioPrivacy();
  const router = useRouter();

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/backfill`, { method: "POST" });
      if (res.ok) {
        setBackfillDone(true);
        router.refresh();
      }
    } catch {
      // non-fatal
    } finally {
      setBackfilling(false);
    }
  }

  async function handleRemoveBackfill() {
    setRemovingBackfill(true);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/backfill`, { method: "DELETE" });
      if (res.ok) {
        setBackfillDone(false);
        router.refresh();
      }
    } catch {
      // non-fatal
    } finally {
      setRemovingBackfill(false);
    }
  }

  const selectedDays = TIMEFRAMES.find((t) => t.label === activeTimeframe)?.days ?? 0;

  const filteredChartData = useMemo(
    () => filterByTimeframe(chartData, selectedDays),
    [chartData, selectedDays]
  );

  // For long timeframes, collapse to one point per day (last snapshot wins).
  // For short views (≤7 days), keep all intraday points to show volatility.
  const displayChartData = useMemo(() => {
    const isShort = selectedDays !== 0 && selectedDays <= 7;
    if (isShort) return filteredChartData;
    const seen = new Map<string, ChartDataPoint>();
    for (const d of filteredChartData) {
      seen.set(d.date.slice(0, 10), d);
    }
    return [...seen.values()];
  }, [filteredChartData, selectedDays]);

  // Context-aware x-axis formatter: short views show date+time, long views show date.
  const dateTick = useMemo(() => {
    const isShort = selectedDays !== 0 && selectedDays <= 7;
    if (isShort) {
      return (value: string) => {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value;
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
          " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      };
    }
    return compactDate;
  }, [selectedDays]);

  // Net Return: TWR-normalized dollar line. Deposits/withdrawals are invisible.
  // Anchored to period start value so each timeframe starts flat.
  const netChartData = useMemo(() => {
    if (displayChartData.length < 2) return [];
    const startValue = displayChartData[0].portfolio_value;
    const startTwr = displayChartData[0].portfolio_twr_pct;
    // Benchmark baseline: first point that actually has a benchmark value. The
    // benchmark line shows what the same starting value would be worth if it had
    // tracked the index over this period (rebased to the start, same as the % stat).
    const startBench = displayChartData.find((d) => d.benchmark_return_pct !== null)?.benchmark_return_pct ?? null;
    // Linked: the benchmark line is the "same deposits in the benchmark" mirror — what
    // this money would be worth had every deposit bought the index instead. Rebasing the
    // index to the starting value is meaningless on a deposit-funded value chart.
    const mirrorByDate = isLinked && benchMirror && benchMirror.length >= 2
      ? new Map(benchMirror.map((pt) => [pt.date.slice(0, 10), pt.value]))
      : null;
    return displayChartData.map((d) => {
      const periodTwr = ((1 + d.portfolio_twr_pct / 100) / (1 + startTwr / 100) - 1) * 100;
      let bench_value: number | null = null;
      if (mirrorByDate) {
        bench_value = mirrorByDate.get(d.date.slice(0, 10)) ?? null;
      } else if (startBench !== null && d.benchmark_return_pct !== null) {
        const periodBench = d.benchmark_return_pct - startBench;
        bench_value = startValue * (1 + periodBench / 100);
      }
      return {
        date: d.date,
        // Linked portfolios plot the real account value (which already reflects deposits);
        // unlinked plot the TWR-normalized dollar line (deposits made invisible).
        net_value: isLinked ? d.portfolio_value : startValue * (1 + periodTwr / 100),
        actual_value: d.portfolio_value,
        bench_value,
      };
    });
  }, [displayChartData, isLinked, benchMirror]);

  const netTwrStats = useMemo(() => {
    if (activeTimeframe === "All") {
      // Linked: the money-weighted total return (matches Robinhood). Unlinked: TWR.
      return isLinked
        ? { twrPct: portfolioReturnPct, benchPct: benchmarkReturnPct, excess: excessReturnPct }
        : { twrPct: portfolioTwrPct, benchPct: benchmarkReturnPct, excess: excessTwrPct };
    }
    if (filteredChartData.length < 2) return { twrPct: null, benchPct: null, excess: null };
    const firstBench = filteredChartData[0].benchmark_return_pct;
    const lastBench = filteredChartData[filteredChartData.length - 1].benchmark_return_pct;
    const periodBench = firstBench !== null && lastBench !== null ? lastBench - firstBench : null;
    if (isLinked) {
      // Deposit-free growth over the window (TWR index): actual stock growth, deposits
      // move the value line but not this number. Falls back to raw value change only if
      // the index isn't available.
      let periodRet: number | null = null;
      if (linkedTwrIndex && linkedTwrIndex.length >= 2) {
        const startKey = filteredChartData[0].date.slice(0, 10);
        const endKey = filteredChartData[filteredChartData.length - 1].date.slice(0, 10);
        let idx0: number | null = null, idx1: number | null = null;
        for (const pt of linkedTwrIndex) {
          const k = pt.date.slice(0, 10);
          if (k <= startKey || idx0 === null) idx0 = pt.value; // last index at/before window start
          if (k <= endKey) idx1 = pt.value;
        }
        if (idx0 != null && idx1 != null && idx0 > 0) periodRet = (idx1 / idx0 - 1) * 100;
      }
      if (periodRet === null) {
        const firstVal = filteredChartData[0].portfolio_value;
        const lastVal = filteredChartData[filteredChartData.length - 1].portfolio_value;
        periodRet = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : null;
      }
      return { twrPct: periodRet, benchPct: periodBench, excess: periodRet !== null && periodBench !== null ? periodRet - periodBench : null };
    }
    const firstTwr = filteredChartData[0].portfolio_twr_pct;
    const lastTwr = filteredChartData[filteredChartData.length - 1].portfolio_twr_pct;
    const periodTwr = ((1 + lastTwr / 100) / (1 + firstTwr / 100) - 1) * 100;
    return { twrPct: periodTwr, benchPct: periodBench, excess: periodBench !== null ? periodTwr - periodBench : null };
  }, [filteredChartData, activeTimeframe, isLinked, linkedTwrIndex, portfolioReturnPct, portfolioTwrPct, benchmarkReturnPct, excessReturnPct, excessTwrPct]);

  const currentValue = chartData.length > 0 ? chartData[chartData.length - 1].portfolio_value : null;
  const isNetPositive = (netTwrStats.twrPct ?? 0) >= 0;

  const netStats: StatItem[] = [
    { label: "Net Return", value: formatPercent(netTwrStats.twrPct), positive: (netTwrStats.twrPct ?? 0) >= 0 },
    { label: benchmarkSymbol, value: formatPercent(netTwrStats.benchPct), positive: (netTwrStats.benchPct ?? 0) >= 0 },
    { label: "Excess", value: formatPercent(netTwrStats.excess), positive: (netTwrStats.excess ?? 0) >= 0 },
  ];

  const twrStats: StatItem[] = [
    { label: "Inv. Return", value: formatPercent(portfolioTwrPct), positive: (portfolioTwrPct ?? 0) >= 0 },
    { label: benchmarkSymbol, value: formatPercent(benchmarkReturnPct), positive: (benchmarkReturnPct ?? 0) >= 0 },
    { label: "Excess", value: formatPercent(excessTwrPct), positive: (excessTwrPct ?? 0) >= 0 },
  ];

  const activeStats = chartMode === "net" ? netStats : twrStats;

  return (
    <div className="mb-6 rounded-2xl p-5" style={{ border: "1px solid var(--line-007)", background: "var(--surface-003)" }}>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          {chartMode === "net" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Portfolio Value</p>
              {currentValue !== null && (
                <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
                  {isPrivate ? "$••••••" : `$${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              )}
              <p className={`mt-0.5 text-sm font-medium ${isNetPositive ? "text-emerald-400" : "text-red-400"}`}>
                {isPrivate ? "••••••" : formatPercent(netTwrStats.twrPct)}
                <span className="ml-2 text-xs text-slate-500">net return · {activeTimeframe}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Investment Return</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight" style={{ color: (portfolioTwrPct ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                {isPrivate ? "••••••" : formatPercent(portfolioTwrPct)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Deposits excluded · {activeTimeframe}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 min-w-0">
          {!isLinked && (
            <div className="bt-tabs-scroll flex rounded-xl border border-white/8 bg-white/3 p-0.5" style={{ overflowX: "auto" }}>
              {CHART_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setChartMode(mode.value as "net" | "twr")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                    chartMode === mode.value ? "bg-white/10" : "text-slate-500 hover:text-slate-300"
                  }`}
                  style={chartMode === mode.value ? { color: "var(--text-primary)" } : undefined}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          )}

          <div className="bt-tabs-scroll flex rounded-xl border border-white/8 bg-white/3 p-0.5" style={{ overflowX: "auto" }}>
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.label}
                type="button"
                onClick={() => setActiveTimeframe(tf.label)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                  activeTimeframe === tf.label ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats row */}
      {hasEnoughSnapshots && (
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {activeStats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-white/5 bg-white/2 px-3 py-2.5 text-center">
                <p className="text-[10px] uppercase tracking-widest text-slate-500">{stat.label}</p>
                <p className={`mt-1 text-base font-semibold ${stat.positive ? "text-emerald-400" : "text-red-400"}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      {chartData.length < 2 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-4 rounded-xl border border-white/5 bg-white/2 px-6 text-center">
          {backfillDone ? (
            <p className="text-sm text-slate-400">History loaded — refreshing chart…</p>
          ) : (
            <>
              <div>
                <p className="text-sm text-slate-300 font-medium">Build your chart history</p>
                <p className="mt-1 text-xs text-slate-500">Fetch historical prices from Polygon.io for all holdings back to your first purchase date.</p>
              </div>
              <button
                onClick={handleBackfill}
                disabled={backfilling}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {backfilling ? (
                  <>
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                    </svg>
                    Fetching history… (may take a minute)
                  </>
                ) : "Build chart history"}
              </button>
              <p className="text-[10px] text-slate-600">Snapshots also record automatically each day.</p>
            </>
          )}
        </div>
      ) : chartData.length < 5 && !backfillDone ? (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-white/5 bg-white/2 px-4 py-2.5">
          <p className="text-xs text-slate-500">Chart history is sparse — only {chartData.length} snapshot{chartData.length !== 1 ? "s" : ""}.</p>
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="flex items-center gap-1.5 rounded-md bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 transition hover:bg-blue-600/30 disabled:opacity-60"
          >
            {backfilling ? "Fetching…" : "Backfill history"}
          </button>
        </div>
      ) : null}

      {chartData.length >= 2 && chartMode === "net" ? (
        <div className="h-56 min-w-0">
          {netChartData.length < 2 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/5 bg-white/2">
              <p className="text-sm text-slate-400">No data for this timeframe.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={netChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isNetPositive ? "#34d399" : "#f87171"} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={isNetPositive ? "#34d399" : "#f87171"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={dateTick} stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={50} />
                <YAxis stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} tickFormatter={formatMoney} />
                <Tooltip
                  formatter={(value, name) => [
                    `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    name === "net_value" ? (isLinked ? "Value" : "Net Return") : name === "bench_value" ? benchmarkSymbol : "Actual Value",
                  ]}
                  labelFormatter={(label) => dateTick(String(label))}
                  contentStyle={tooltipStyle}
                />
                <Area type="monotone" dataKey="net_value" stroke={isNetPositive ? "#34d399" : "#f87171"} strokeWidth={2.5} fill="url(#netGradient)" dot={false} activeDot={{ r: 4 }} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                <Line type="monotone" dataKey="bench_value" stroke="#64748b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={true} animationDuration={1000} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <div className="h-56 min-w-0">
          {displayChartData.length < 2 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/5 bg-white/2">
              <p className="text-sm text-slate-400">No data for this timeframe.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={displayChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="twrGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                <XAxis dataKey="date" tickFormatter={dateTick} stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={50} />
                <YAxis stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Tooltip
                  formatter={(value, name) => [formatPercent(Number(value)), name === "portfolio_twr_pct" ? "Inv. Return" : benchmarkSymbol]}
                  labelFormatter={(label) => dateTick(String(label))}
                  contentStyle={tooltipStyle}
                />
                <Area type="monotone" dataKey="portfolio_twr_pct" stroke="#a78bfa" strokeWidth={2.5} fill="url(#twrGradient)" dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                <Line type="monotone" dataKey="benchmark_return_pct" stroke="#64748b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={true} animationDuration={1000} animationEasing="ease-out" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Legend + Reset */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        {marketOpen !== null && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: marketOpen ? "#34d399" : marketSession === "after_hours" || marketSession === "pre_market" ? "#f59e0b" : "#475569",
                boxShadow: marketOpen ? "0 0 4px #34d399" : "none",
              }}
            />
            <span style={{ color: marketOpen ? "#34d399" : marketSession === "after_hours" ? "#f59e0b" : marketSession === "pre_market" ? "#f59e0b" : "#475569" }}>
              {marketOpen ? "Market open" : marketSession === "after_hours" ? "After hours" : marketSession === "pre_market" ? "Pre-market" : "Market closed"}
            </span>
          </span>
        )}
        {hasEnoughSnapshots && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded" style={{ background: chartMode === "twr" ? "#a78bfa" : (isNetPositive ? "#34d399" : "#f87171") }} />
              {chartMode === "twr" ? "Inv. Return (TWR)" : isLinked ? "Portfolio Value" : "Net Return"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4" style={{ background: "#64748b", display: "inline-block" }} />
              {isLinked && benchMirror && benchMirror.length >= 2 ? `${benchmarkSymbol} · same deposits` : benchmarkSymbol}
            </span>
            {startDateLabel && endDateLabel && (
              <span className="text-slate-600">{startDateLabel} → {endDateLabel}</span>
            )}
          </>
        )}
        <span className="ml-auto flex items-center gap-3">
          {backfillDone ? (
            <button
              type="button"
              onClick={handleRemoveBackfill}
              disabled={removingBackfill}
              className="text-[11px] text-amber-500/70 hover:text-amber-400 underline underline-offset-2 transition disabled:opacity-50"
            >
              {removingBackfill ? "Removing…" : "Undo backfill"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBackfill}
              disabled={backfilling}
              className="text-[11px] text-blue-400/70 hover:text-blue-400 underline underline-offset-2 transition disabled:opacity-50"
            >
              {backfilling ? "Fetching…" : "Build chart history"}
            </button>
          )}
          <ResetPerformanceButton portfolioId={portfolioId} holdings={holdings} />
        </span>
      </div>
    </div>
  );
}
