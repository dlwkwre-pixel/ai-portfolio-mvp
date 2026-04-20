"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PortfolioChartProps = {
  data: {
    date: string;
    total_value: number;
  }[];
};

function formatMoney(value: unknown) {
  if (value === null || value === undefined) return "—";

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return "—";

  return `$${numberValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

export default function PortfolioChart({ data }: PortfolioChartProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Portfolio History</h2>
          <p className="mt-1 text-sm text-slate-400">
            Historical portfolio value snapshots.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          {data.length} snapshot{data.length === 1 ? "" : "s"}
        </div>
      </div>

      {data.length > 0 ? (
        <div className="mt-4 h-64 min-w-0 rounded-xl border border-slate-800 bg-slate-950 px-2 py-3">
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
                width={82}
                tickFormatter={(value) =>
                  `$${Number(value).toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}`
                }
              />

              <Tooltip
                formatter={(value) => [formatMoney(value), "Portfolio Value"]}
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
                dataKey="total_value"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-4 flex h-64 min-w-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 px-4 text-center">
          <p className="text-sm text-slate-400">
            No snapshot history yet. Add your first snapshot below.
          </p>
        </div>
      )}
    </section>
  );
}