"use client";

import { useState, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

export type CombinedChartPoint = { date: string; total: number };

const TIMEFRAMES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "YTD", days: -1 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
];

function filterByDays(data: CombinedChartPoint[], days: number): CombinedChartPoint[] {
  if (days === 0) return data;
  const cutoff = days === -1
    ? new Date(new Date().getFullYear(), 0, 1)
    : new Date(Date.now() - days * 86_400_000);
  return data.filter(d => new Date(d.date) >= cutoff);
}

function formatMoney(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type TooltipProps = {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
};

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "10px 14px", fontSize: "12px" }}>
      <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>{label ? formatDate(label) : ""}</div>
      <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "14px" }}>
        {formatMoney(payload[0].value)}
      </div>
    </div>
  );
}

export default function CombinedChartClient({ data }: { data: CombinedChartPoint[] }) {
  const [tfDays, setTfDays] = useState(0);

  const filtered = useMemo(() => filterByDays(data, tfDays), [data, tfDays]);

  const startVal = filtered[0]?.total ?? 0;
  const endVal   = filtered[filtered.length - 1]?.total ?? 0;
  const changePct = startVal > 0 ? ((endVal - startVal) / startVal) * 100 : 0;
  const isUp = changePct >= 0;
  const lineColor = isUp ? "#00d395" : "#fb7185";

  const minVal = Math.min(...filtered.map(d => d.total));
  const maxVal = Math.max(...filtered.map(d => d.total));
  const padding = (maxVal - minVal) * 0.08 || maxVal * 0.05;

  if (filtered.length < 2) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
        Not enough snapshots yet — more data will appear as you use the app.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {formatMoney(endVal)}
          </div>
          <div style={{ fontSize: "11px", color: isUp ? "var(--green)" : "var(--red)", marginTop: "1px", fontFamily: "var(--font-mono)" }}>
            {isUp ? "+" : ""}{changePct.toFixed(2)}% this period
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.label}
              onClick={() => setTfDays(tf.days)}
              style={{
                padding: "3px 8px",
                borderRadius: "6px",
                fontSize: "10px",
                fontWeight: 600,
                border: "1px solid",
                cursor: "pointer",
                transition: "all 120ms",
                borderColor: tfDays === tf.days ? "var(--brand-blue)" : "var(--border-subtle)",
                background: tfDays === tf.days ? "rgba(37,99,235,0.15)" : "transparent",
                color: tfDays === tf.days ? "var(--brand-blue)" : "var(--text-muted)",
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={filtered} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ccGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={lineColor} stopOpacity={0.18} />
              <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 9, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[minVal - padding, maxVal + padding]}
            tickFormatter={formatMoney}
            tick={{ fontSize: 9, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="total"
            stroke={lineColor}
            strokeWidth={2}
            fill="url(#ccGrad)"
            dot={false}
            activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
