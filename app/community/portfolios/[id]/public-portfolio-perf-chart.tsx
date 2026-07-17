"use client";

import { useState, useMemo } from "react";
import { formatDay } from "@/lib/dates";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";

type PerfPoint = { snapshot_date: string; return_pct: number };

const TIMEFRAMES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "YTD", days: -1 },
  { label: "1Y", days: 365 },
  { label: "All", days: 0 },
];

function filterByDays(data: PerfPoint[], days: number): PerfPoint[] {
  if (days === 0) return data;
  const cutoff = days === -1
    ? new Date(new Date().getFullYear(), 0, 1)
    : new Date(Date.now() - days * 86400000);
  return data.filter((d) => new Date(d.snapshot_date) >= cutoff);
}

function fmtDate(v: string) {
  // snapshot_date is a bare "YYYY-MM-DD" — parse at local noon so the label
  // doesn't show the previous day in US timezones (see lib/dates.ts).
  return formatDay(v);
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid var(--line-010)",
  borderRadius: "12px",
  color: "#fff",
  fontSize: "12px",
};

export default function PublicPortfolioPerfChart({ data }: { data: PerfPoint[] }) {
  const [tf, setTf] = useState("All");
  const days = TIMEFRAMES.find((t) => t.label === tf)?.days ?? 0;
  const filtered = useMemo(() => filterByDays(data, days), [data, days]);

  const latest = filtered.length > 0 ? filtered[filtered.length - 1].return_pct : null;
  const isPositive = (latest ?? 0) >= 0;

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--card-border)",
      borderRadius: "var(--radius-lg)", padding: "20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "18px", flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px" }}>
            Return since published
          </p>
          {latest !== null && (
            <p style={{
              fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700,
              letterSpacing: "-0.5px", lineHeight: 1,
              color: isPositive ? "var(--green)" : "var(--red)",
            }}>
              {fmtPct(latest)}
            </p>
          )}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
            % change from publication date · {tf}
          </p>
        </div>
        {/* Timeframe buttons */}
        <div style={{
          display: "flex", background: "var(--surface-003)",
          border: "1px solid var(--line-006)", borderRadius: "10px", padding: "3px",
        }}>
          {TIMEFRAMES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setTf(t.label)}
              style={{
                padding: "5px 10px", borderRadius: "8px",
                fontSize: "11px", fontWeight: 500,
                background: tf === t.label ? "rgba(255,255,255,0.1)" : "transparent",
                color: tf === t.label ? "var(--text-primary)" : "var(--text-muted)",
                border: "none", cursor: "pointer", whiteSpace: "nowrap",
                fontFamily: "var(--font-body)",
                transition: "background 120ms ease, color 120ms ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {filtered.length < 2 ? (
        <div style={{
          height: "160px", display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--surface-002)", borderRadius: "var(--radius-md)",
          border: "1px solid var(--line-006)",
        }}>
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Not enough data for this timeframe.
          </p>
        </div>
      ) : (
        <div style={{ height: "160px", minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pubPerfGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? "#34d399" : "#f87171"} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={isPositive ? "#34d399" : "#f87171"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" vertical={false} />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
              <XAxis
                dataKey="snapshot_date" tickFormatter={fmtDate}
                stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false} tickLine={false} minTickGap={40}
              />
              <YAxis
                stroke="#475569" tick={{ fontSize: 10, fill: "#64748b" }}
                axisLine={false} tickLine={false} width={52}
                tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
              />
              <Tooltip
                formatter={(v) => [fmtPct(Number(v)), "Return"]}
                labelFormatter={(label) => fmtDate(String(label))}
                contentStyle={tooltipStyle}
              />
              <Area
                type="monotone" dataKey="return_pct"
                stroke={isPositive ? "#34d399" : "#f87171"} strokeWidth={2.5}
                fill="url(#pubPerfGrad)" dot={false} activeDot={{ r: 4 }}
                isAnimationActive animationDuration={600} animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
