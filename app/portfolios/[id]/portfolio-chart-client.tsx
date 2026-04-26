"use client";

import { useState, useMemo } from "react";
import { usePortfolioPrivacy } from "./portfolio-privacy-context";
import {
  CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart,
} from "recharts";

type Snapshot = {
  date: string;
  total_value: number;
};

type ChartDataPoint = {
  date: string;
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
  snapshots: Snapshot[];
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
  { label: "Investment Return (%)", value: "twr" },
  { label: "Total Return (%)", value: "return" },
  { label: "Value ($)", value: "value" },
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
  snapshots,
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
}: PortfolioChartClientProps) {
  const [activeTimeframe, setActiveTimeframe] = useState("All");
  const [chartMode, setChartMode] = useState<"value" | "return" | "twr">("twr");
  const { isPrivate } = usePortfolioPrivacy();

  const selectedDays = TIMEFRAMES.find((t) => t.label === activeTimeframe)?.days ?? 0;

  const filteredSnapshots = useMemo(
    () => filterByTimeframe(snapshots, selectedDays),
    [snapshots, selectedDays]
  );

  const filteredChartData = useMemo(
    () => filterByTimeframe(chartData, selectedDays),
    [chartData, selectedDays]
  );

  const valueChange = useMemo(() => {
    if (filteredSnapshots.length < 2) return null;
    const first = filteredSnapshots[0].total_value;
    const last = filteredSnapshots[filteredSnapshots.length - 1].total_value;
    const change = last - first;
    const pct = first > 0 ? (change / first) * 100 : 0;
    return { change, pct, isPositive: change >= 0 };
  }, [filteredSnapshots]);

  const currentValue = snapshots.length > 0
    ? snapshots[snapshots.length - 1].total_value
    : null;

  const isPositive = valueChange ? valueChange.isPositive : (portfolioReturnPct ?? 0) >= 0;

  const returnStats: StatItem[] = [
    { label: "Portfolio", value: formatPercent(portfolioReturnPct), positive: (portfolioReturnPct ?? 0) >= 0 },
    { label: benchmarkSymbol, value: formatPercent(benchmarkReturnPct), positive: (benchmarkReturnPct ?? 0) >= 0 },
    { label: "Excess", value: formatPercent(excessReturnPct), positive: (excessReturnPct ?? 0) >= 0 },
  ];

  const twrStats: StatItem[] = [
    { label: "Inv. Return", value: formatPercent(portfolioTwrPct), positive: (portfolioTwrPct ?? 0) >= 0 },
    { label: benchmarkSymbol, value: formatPercent(benchmarkReturnPct), positive: (benchmarkReturnPct ?? 0) >= 0 },
    { label: "Excess", value: formatPercent(excessTwrPct), positive: (excessTwrPct ?? 0) >= 0 },
  ];

  const activeStats = chartMode === "twr" ? twrStats : returnStats;

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
          ) : chartMode === "return" ? (
            <>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">Total Return</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight" style={{ color: (portfolioReturnPct ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                {isPrivate ? "••••••" : formatPercent(portfolioReturnPct)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Includes deposits · {activeTimeframe}
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

        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-white/8 bg-white/3 p-0.5">
            {CHART_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setChartMode(mode.value as "value" | "return" | "twr")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  chartMode === mode.value ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex rounded-xl border border-white/8 bg-white/3 p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.label}
                type="button"
                onClick={() => setActiveTimeframe(tf.label)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTimeframe === tf.label ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats row for return/twr modes */}
      {hasEnoughSnapshots && (chartMode === "return" || chartMode === "twr") && (
        <div className="mb-4 space-y-2">
          {chartMode === "twr" && (
            <div className="rounded-xl border border-blue-500/15 bg-blue-500/5 px-3 py-2 text-xs text-blue-300">
              <span className="font-semibold">Investment Return</span> strips out deposits and withdrawals — showing only how well your investments actually performed.
            </div>
          )}
          {chartMode === "return" && (
            <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-400">Total Return</span> includes deposits — good for tracking total wealth growth (e.g. Roth IRA contributions).
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
      {snapshots.length < 2 ? (
        <div className="flex h-48 items-center justify-center rounded-xl border border-white/5 bg-white/2">
          <div className="text-center">
            <p className="text-sm text-slate-400">
              {snapshots.length === 0
                ? "Portfolio is being tracked. Check back tomorrow for your first data point."
                : "Need at least 2 snapshots to show the chart. Come back tomorrow!"}
            </p>
            <p className="mt-1 text-xs text-slate-600">Snapshots are recorded automatically each day.</p>
          </div>
        </div>
      ) : chartMode === "value" ? (
        <div className="h-56 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredSnapshots} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
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
              <Area type="monotone" dataKey="total_value" stroke={isPositive ? "#34d399" : "#f87171"} strokeWidth={2.5} fill="url(#portfolioGradient)" dot={false} activeDot={{ r: 4 }} isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : chartMode === "return" ? (
        <div className="h-56 min-w-0">
          {filteredChartData.length < 2 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-white/5 bg-white/2">
              <p className="text-sm text-slate-400">No return data for this timeframe.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="returnGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                <XAxis dataKey="date" tickFormatter={compactDate} stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Tooltip
                  formatter={(value, name) => [formatPercent(Number(value)), name === "portfolio_return_pct" ? "Total Return" : benchmarkSymbol]}
                  labelFormatter={(label) => compactDate(label)}
                  contentStyle={tooltipStyle}
                />
                <Area type="monotone" dataKey="portfolio_return_pct" stroke="#38bdf8" strokeWidth={2.5} fill="url(#returnGradient)" dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={true} animationDuration={800} animationEasing="ease-out" />
                <Line type="monotone" dataKey="benchmark_return_pct" stroke="#64748b" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={true} animationDuration={1000} animationEasing="ease-out" />
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

      {/* Legend */}
      {(chartMode === "return" || chartMode === "twr") && hasEnoughSnapshots && (
        <div className="mt-3 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-4 rounded ${chartMode === "twr" ? "bg-violet-400" : "bg-sky-400"}`} />
            {chartMode === "twr" ? "Inv. Return (TWR)" : "Total Return"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 rounded bg-slate-500" />
            {benchmarkSymbol}
          </span>
          {startDateLabel && endDateLabel && (
            <span className="ml-auto text-slate-600">{startDateLabel} → {endDateLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
