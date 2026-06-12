"use client";

import { useState, useMemo } from "react";
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
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "12px",
  color: "#ffffff",
  fontSize: "12px",
};

export default function PortfolioChartClient({
  portfolioId,
  chartData,
  benchmarkSymbol,
  portfolioTwrPct,
  benchmarkReturnPct,
  excessTwrPct,
  startDateLabel,
  endDateLabel,
  hasEnoughSnapshots,
  holdings,
}: PortfolioChartClientProps) {
  const [activeTimeframe, setActiveTimeframe] = useState("All");
  const [chartMode, setChartMode] = useState<"net" | "twr">("net");
  const { isPrivate } = usePortfolioPrivacy();

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
    return displayChartData.map((d) => {
      const periodTwr = ((1 + d.portfolio_twr_pct / 100) / (1 + startTwr / 100) - 1) * 100;
      return {
        date: d.date,
        net_value: startValue * (1 + periodTwr / 100),
        actual_value: d.portfolio_value,
      };
    });
  }, [displayChartData]);

  const netTwrStats = useMemo(() => {
    if (activeTimeframe === "All") {
      return { twrPct: portfolioTwrPct, benchPct: benchmarkReturnPct, excess: excessTwrPct };
    }
    if (filteredChartData.length < 2) return { twrPct: null, benchPct: null, excess: null };
    const firstTwr = filteredChartData[0].portfolio_twr_pct;
    const lastTwr = filteredChartData[filteredChartData.length - 1].portfolio_twr_pct;
    const periodTwr = ((1 + lastTwr / 100) / (1 + firstTwr / 100) - 1) * 100;
    const firstBench = filteredChartData[0].benchmark_return_pct;
    const lastBench = filteredChartData[filteredChartData.length - 1].benchmark_return_pct;
    const periodBench = firstBench !== null && lastBench !== null ? lastBench - firstBench : null;
    return { twrPct: periodTwr, benchPct: periodBench, excess: periodBench !== null ? periodTwr - periodBench : null };
  }, [filteredChartData, activeTimeframe, portfolioTwrPct, benchmarkReturnPct, excessTwrPct]);

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
    <div className="mb-6 rounded-2xl p-5" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>

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
          <div className="bt-tabs-scroll flex rounded-xl border border-white/8 bg-white/3 p-0.5" style={{ overflowX: "auto" }}>
            {CHART_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setChartMode(mode.value as "net" | "twr")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition whitespace-nowrap ${
                  chartMode === mode.value ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

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
        <div className="flex h-48 items-center justify-center rounded-xl border border-white/5 bg-white/2">
          <div className="text-center">
            <p className="text-sm text-slate-400">
              {chartData.length === 0
                ? "Portfolio is being tracked. Check back tomorrow for your first data point."
                : "Need at least 2 snapshots to show the chart. Come back tomorrow!"}
            </p>
            <p className="mt-1 text-xs text-slate-600">Snapshots are recorded automatically each day.</p>
          </div>
        </div>
      ) : chartMode === "net" ? (
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
                    name === "net_value" ? "Net Return" : "Actual Value",
                  ]}
                  labelFormatter={(label) => dateTick(String(label))}
                  contentStyle={tooltipStyle}
                />
                <Area type="monotone" dataKey="net_value" stroke={isNetPositive ? "#34d399" : "#f87171"} strokeWidth={2.5} fill="url(#netGradient)" dot={false} activeDot={{ r: 4 }} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
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
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        {hasEnoughSnapshots && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded" style={{ background: chartMode === "twr" ? "#a78bfa" : (isNetPositive ? "#34d399" : "#f87171") }} />
              {chartMode === "twr" ? "Inv. Return (TWR)" : "Net Return"}
            </span>
            {chartMode === "twr" && (
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4" style={{ background: "#64748b", display: "inline-block" }} />
                {benchmarkSymbol}
              </span>
            )}
            {startDateLabel && endDateLabel && (
              <span className="text-slate-600">{startDateLabel} → {endDateLabel}</span>
            )}
          </>
        )}
        <span className="ml-auto">
          <ResetPerformanceButton portfolioId={portfolioId} holdings={holdings} />
        </span>
      </div>
    </div>
  );
}
