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
  { label: "Value $", value: "value" },
  { label: "% Ret.", value: "pct" },
  { label: "Inv. Return", value: "twr" },
];

function filterByTimeframe<T extends { date: string }>(data: T[], days: number): T[] {
  if (days === 0) return data;
  const now = new Date();
  const cutoff = days === -1
    ? new Date(now.getFullYear(), 0, 1)
    : new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return data.filter((d) => new Date(d.date) >= cutoff);
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
  const d = new Date(value);
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
  portfolioReturnPct,
  portfolioTwrPct,
  benchmarkReturnPct,
  excessReturnPct,
  excessTwrPct,
  startDateLabel,
  endDateLabel,
  hasEnoughSnapshots,
  netInvested,
  holdings,
}: PortfolioChartClientProps) {
  const [activeTimeframe, setActiveTimeframe] = useState("All");
  const [chartMode, setChartMode] = useState<"value" | "pct" | "twr">("value");
  const { isPrivate } = usePortfolioPrivacy();

  const selectedDays = TIMEFRAMES.find((t) => t.label === activeTimeframe)?.days ?? 0;

  const filteredChartData = useMemo(
    () => filterByTimeframe(chartData, selectedDays),
    [chartData, selectedDays]
  );

  const valueChange = useMemo(() => {
    if (filteredChartData.length < 2) return null;
    const last = filteredChartData[filteredChartData.length - 1].portfolio_value;
    if (activeTimeframe === "All" && netInvested != null && netInvested > 0) {
      const change = last - netInvested;
      const pct = (change / netInvested) * 100;
      return { change, pct, isPositive: change >= 0 };
    }
    const first = filteredChartData[0].portfolio_value;
    const change = last - first;
    const pct = first > 0 ? (change / first) * 100 : 0;
    return { change, pct, isPositive: change >= 0 };
  }, [filteredChartData, netInvested, activeTimeframe]);

  // Period-relative % chart data: starts at 0% for every timeframe.
  // "All" uses server-computed portfolio_return_pct (anchored to cost basis).
  // Other periods rebase both portfolio and benchmark to 0% at period start.
  const pctChartData = useMemo(() => {
    if (filteredChartData.length < 2) return [];

    if (activeTimeframe === "All") {
      return filteredChartData.map((d) => ({
        date: d.date,
        portfolio_pct: d.portfolio_return_pct,
        benchmark_pct: d.benchmark_return_pct,
      }));
    }

    const firstPortValue = filteredChartData[0].portfolio_value;
    const firstBenchPct = filteredChartData[0].benchmark_return_pct;

    return filteredChartData.map((d) => ({
      date: d.date,
      portfolio_pct: firstPortValue > 0
        ? ((d.portfolio_value - firstPortValue) / firstPortValue) * 100
        : 0,
      benchmark_pct:
        d.benchmark_return_pct !== null && firstBenchPct !== null
          ? d.benchmark_return_pct - firstBenchPct
          : null,
    }));
  }, [filteredChartData, activeTimeframe]);

  // Stats for % chart: use server values for "All", compute period stats otherwise
  const periodPctStats = useMemo(() => {
    if (activeTimeframe === "All") {
      return {
        portfolioPct: portfolioReturnPct,
        benchPct: benchmarkReturnPct,
        excess: excessReturnPct,
      };
    }
    if (pctChartData.length < 2) return { portfolioPct: null, benchPct: null, excess: null };
    const last = pctChartData[pctChartData.length - 1];
    const portfolioPct = last.portfolio_pct;
    const benchPct = last.benchmark_pct ?? null;
    const excess = portfolioPct !== null && benchPct !== null ? portfolioPct - benchPct : null;
    return { portfolioPct, benchPct, excess };
  }, [pctChartData, activeTimeframe, portfolioReturnPct, benchmarkReturnPct, excessReturnPct]);

  const currentValue = chartData.length > 0
    ? chartData[chartData.length - 1].portfolio_value
    : null;

  const isPositive = valueChange ? valueChange.isPositive : (portfolioReturnPct ?? 0) >= 0;
  const isPctPositive = (periodPctStats.portfolioPct ?? 0) >= 0;

  const returnStats: StatItem[] = [
    { label: "Portfolio", value: formatPercent(portfolioReturnPct), positive: (portfolioReturnPct ?? 0) >= 0 },
    { label: benchmarkSymbol, value: formatPercent(benchmarkReturnPct), positive: (benchmarkReturnPct ?? 0) >= 0 },
    { label: "Excess", value: formatPercent(excessReturnPct), positive: (excessReturnPct ?? 0) >= 0 },
  ];

  const periodReturnStats: StatItem[] = [
    { label: "Portfolio", value: formatPercent(periodPctStats.portfolioPct), positive: (periodPctStats.portfolioPct ?? 0) >= 0 },
    { label: benchmarkSymbol, value: formatPercent(periodPctStats.benchPct), positive: (periodPctStats.benchPct ?? 0) >= 0 },
    { label: "Excess", value: formatPercent(periodPctStats.excess), positive: (periodPctStats.excess ?? 0) >= 0 },
  ];

  const twrStats: StatItem[] = [
    { label: "Inv. Return", value: formatPercent(portfolioTwrPct), positive: (portfolioTwrPct ?? 0) >= 0 },
    { label: benchmarkSymbol, value: formatPercent(benchmarkReturnPct), positive: (benchmarkReturnPct ?? 0) >= 0 },
    { label: "Excess", value: formatPercent(excessTwrPct), positive: (excessTwrPct ?? 0) >= 0 },
  ];

  const activeStats = chartMode === "twr" ? twrStats : chartMode === "pct" ? periodReturnStats : returnStats;

  return (
    <div className="mb-6 rounded-2xl p-5" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          {chartMode === "twr" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Investment Return</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight" style={{ color: (portfolioTwrPct ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                {isPrivate ? "••••••" : formatPercent(portfolioTwrPct)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Deposits excluded · {activeTimeframe}
              </p>
            </>
          ) : chartMode === "pct" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">% Return</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight" style={{ color: isPctPositive ? "var(--green)" : "var(--red)" }}>
                {isPrivate ? "••••••" : formatPercent(periodPctStats.portfolioPct)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                vs {benchmarkSymbol} {formatPercent(periodPctStats.benchPct)} · {activeTimeframe}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Portfolio Value</p>
              {currentValue !== null && (
                <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
                  {isPrivate ? "$••••••" : `$${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </p>
              )}
              {valueChange !== null && (
                <p className={`mt-0.5 text-sm font-medium ${valueChange.isPositive ? "text-emerald-400" : "text-red-400"}`}>
                  {isPrivate ? "$••••••" : `${valueChange.isPositive ? "+" : ""}$${Math.abs(valueChange.change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${valueChange.isPositive ? "+" : ""}${valueChange.pct.toFixed(2)}%)`}
                  <span className="ml-2 text-xs text-slate-500">{activeTimeframe}</span>
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 min-w-0">
          <div className="bt-tabs-scroll flex rounded-xl border border-white/8 bg-white/3 p-0.5" style={{ overflowX: "auto" }}>
            {CHART_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setChartMode(mode.value as "value" | "pct" | "twr")}
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
          {chartMode === "twr" && (
            <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
              <span className="font-semibold">Inv. Return (TWR)</span> measures how well your picks performed, regardless of when you deposited money. Think of it as: &ldquo;if I had timed everything perfectly, what would my return be?&rdquo; Can be higher or lower than your actual gain on cash invested.
            </div>
          )}
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
      ) : chartMode === "value" ? (
        <div className="h-56 min-w-0">
          {filteredChartData.length < 2 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/5 bg-white/2">
              <p className="text-sm text-slate-400">No data for this timeframe.</p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? "#34d399" : "#f87171"} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={isPositive ? "#34d399" : "#f87171"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={compactDate} stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} tickFormatter={formatMoney} />
              <Tooltip
                formatter={(value) => [`$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, "Portfolio Value"]}
                labelFormatter={(label) => compactDate(label)}
                contentStyle={tooltipStyle}
              />
              <Area type="monotone" dataKey="portfolio_value" stroke={isPositive ? "#34d399" : "#f87171"} strokeWidth={2.5} fill="url(#portfolioGradient)" dot={false} activeDot={{ r: 4 }} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>
      ) : chartMode === "pct" ? (
        <div className="h-56 min-w-0">
          {pctChartData.length < 2 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/5 bg-white/2">
              <p className="text-sm text-slate-400">No data for this timeframe.</p>
            </div>
          ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pctChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pctGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPctPositive ? "#34d399" : "#f87171"} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={isPctPositive ? "#34d399" : "#f87171"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
              <XAxis dataKey="date" tickFormatter={compactDate} stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
              <Tooltip
                formatter={(value, name) => [
                  formatPercent(Number(value)),
                  name === "portfolio_pct" ? "Portfolio" : benchmarkSymbol,
                ]}
                labelFormatter={(label) => compactDate(label)}
                contentStyle={tooltipStyle}
              />
              <Area
                type="monotone"
                dataKey="portfolio_pct"
                stroke={isPctPositive ? "#34d399" : "#f87171"}
                strokeWidth={2.5}
                fill="url(#pctGradient)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={true}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="benchmark_pct"
                stroke="#64748b"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls
                isAnimationActive={true}
                animationDuration={1000}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
          )}
        </div>
      ) : (
        <div className="h-56 min-w-0">
          {filteredChartData.length < 2 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/5 bg-white/2">
              <p className="text-sm text-slate-400">No data for this timeframe.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="twrGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                <XAxis dataKey="date" tickFormatter={compactDate} stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Tooltip
                  formatter={(value, name) => [formatPercent(Number(value)), name === "portfolio_twr_pct" ? "Inv. Return" : benchmarkSymbol]}
                  labelFormatter={(label) => compactDate(label)}
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
        {(chartMode === "twr" || chartMode === "pct") && hasEnoughSnapshots && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded" style={{ background: chartMode === "twr" ? "#a78bfa" : (isPctPositive ? "#34d399" : "#f87171") }} />
              {chartMode === "twr" ? "Inv. Return (TWR)" : "Portfolio %"}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4" style={{ background: "#64748b", display: "inline-block" }} />
              {benchmarkSymbol}
            </span>
            {chartMode === "twr" && startDateLabel && endDateLabel && (
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
