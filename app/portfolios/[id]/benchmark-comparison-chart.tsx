"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type BenchmarkComparisonChartProps = {
  data: {
    date: string;
    portfolio_return_pct: number;
    benchmark_return_pct: number | null;
  }[];
  benchmarkSymbol: string;
};

function formatPercent(value: unknown) {
  if (value === null || value === undefined) return "—";

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "—";

  return `${numberValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function compactDateLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });
}

export default function BenchmarkComparisonChart({
  data,
  benchmarkSymbol,
}: BenchmarkComparisonChartProps) {
  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 px-4 text-center">
        <p className="text-sm text-slate-400">
          Need at least two snapshots to compare portfolio performance against{" "}
          {benchmarkSymbol}.
        </p>
      </div>
    );
  }

  return (
    <div className="h-64 min-w-0 rounded-xl border border-slate-800 bg-slate-950 px-2 py-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            stroke="#1e293b"
            strokeDasharray="3 3"
            vertical={false}
          />

          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />

          <XAxis
            dataKey="date"
            tickFormatter={compactDateLabel}
            stroke="#94a3b8"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />

          <YAxis
            stroke="#94a3b8"
            tick={{ fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(value) =>
              `${Number(value).toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}%`
            }
          />

          <Tooltip
            formatter={(value, name) => {
              const label =
                name === "portfolio_return_pct" ? "Portfolio" : benchmarkSymbol;

              return [formatPercent(value), label];
            }}
            labelFormatter={(label) => `Date: ${label}`}
            contentStyle={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "12px",
              color: "#ffffff",
              fontSize: "12px",
            }}
          />

          <Line
            type="monotone"
            dataKey="portfolio_return_pct"
            name="portfolio_return_pct"
            stroke="#38bdf8"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />

          <Line
            type="monotone"
            dataKey="benchmark_return_pct"
            name="benchmark_return_pct"
            stroke="#94a3b8"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}