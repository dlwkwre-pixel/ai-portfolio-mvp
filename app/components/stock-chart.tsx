"use client";

import { useState, useEffect, useCallback, useId } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChartRange } from "@/lib/market-data/chart-service";

type ChartPoint = { t: number; c: number; label: string };

const RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y"];

const CLIENT_TTL_MS: Record<ChartRange, number> = {
  "1D":  3  * 60 * 1000,
  "1W":  20 * 60 * 1000,
  "1M":  45 * 60 * 1000,
  "3M":  3  * 60 * 60 * 1000,
  "1Y":  12 * 60 * 60 * 1000,
};

// Survives component unmount/remount within the same page session
const _clientCache = new Map<string, { data: ChartPoint[]; ts: number }>();

function fmtLabel(ts: number, range: ChartRange): string {
  const d = new Date(ts);
  if (range === "1D") return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (range === "1W") return d.toLocaleDateString(undefined, { weekday: "short" });
  if (range === "1M" || range === "3M") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

interface StockChartProps {
  ticker: string;
  defaultRange?: ChartRange;
  height?: number;
  showRangeControls?: boolean;
}

export default function StockChart({
  ticker,
  defaultRange = "1D",
  height = 160,
  showRangeControls = true,
}: StockChartProps) {
  const uid = useId().replace(/:/g, "");
  const [range, setRange]           = useState<ChartRange>(defaultRange);
  const [chartData, setChartData]   = useState<ChartPoint[] | null>(null);
  const [loading, setLoading]       = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const loadRange = useCallback(async (r: ChartRange) => {
    const key = `${ticker}:${r}`;
    const cached = _clientCache.get(key);
    if (cached && Date.now() - cached.ts < CLIENT_TTL_MS[r]) {
      setChartData(cached.data.length >= 2 ? cached.data : null);
      setUnavailable(cached.data.length < 2);
      setLoading(false);
      return;
    }

    setLoading(true);
    setUnavailable(false);

    try {
      const res  = await fetch(`/api/stock-chart/${encodeURIComponent(ticker)}?range=${r}`);
      const json = await res.json();
      const raw  = (json.candles ?? []) as { timestamp: number; close: number }[];

      // Coerce to numbers and drop any malformed points — recharts' tick/tooltip
      // formatters call .toFixed and crash if a value is a string or NaN.
      const data: ChartPoint[] = raw
        .map((c) => ({
          t:     Number(c.timestamp),
          c:     Number(c.close),
          label: fmtLabel(Number(c.timestamp), r),
        }))
        .filter((p) => Number.isFinite(p.c) && Number.isFinite(p.t));

      _clientCache.set(key, { data, ts: Date.now() });

      if (data.length < 2) {
        setChartData(null);
        setUnavailable(true);
      } else {
        setChartData(data);
        setUnavailable(false);
      }
    } catch {
      setChartData(null);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  // Reset when ticker changes (handled via key prop by callers, but defensive reset)
  useEffect(() => {
    setRange(defaultRange);
    setChartData(null);
    setLoading(true);
    setUnavailable(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  useEffect(() => {
    loadRange(range);
  }, [range, loadRange]);

  const positive = chartData && chartData.length >= 2
    ? chartData[chartData.length - 1].c >= chartData[0].c
    : true;
  const color = positive ? "#00d395" : "#ff5c5c";
  const gradId = `scg-${uid}`;

  return (
    <div style={{ width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
      {showRangeControls && (
        <div style={{ display: "flex", gap: "4px", marginBottom: "10px", flexWrap: "wrap" }}>
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                padding: "3px 9px",
                borderRadius: "var(--radius-sm)",
                fontSize: "10px",
                fontWeight: range === r ? 600 : 400,
                fontFamily: "var(--font-mono)",
                border: `1px solid ${range === r ? "rgba(37,99,235,0.4)" : "var(--card-border)"}`,
                background: range === r ? "rgba(37,99,235,0.1)" : "transparent",
                color: range === r ? "#93c5fd" : "var(--text-tertiary)",
                cursor: "pointer",
                transition: "color 120ms ease, background 120ms ease, border-color 120ms ease",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div
          className="bt-skeleton"
          style={{ height: `${height}px`, borderRadius: "var(--radius-md)", width: "100%" }}
        />
      ) : unavailable || !chartData ? (
        <div
          style={{
            height: `${height}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--card-bg)",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--card-border)",
          }}
        >
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Chart unavailable</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 4, right: 2, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color} stopOpacity="0.2" />
                <stop offset="100%" stopColor={color} stopOpacity="0"   />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={44}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 9, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={46}
              tickFormatter={(v) => {
                const n = Number(v);
                if (!Number.isFinite(n)) return "";
                return `$${n >= 1000 ? (n / 1000).toFixed(1) + "k" : n.toFixed(0)}`;
              }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                fontSize: "11px",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                padding: "6px 10px",
              }}
              formatter={(v) => [`$${Number(v).toFixed(2)}`, ticker]}
              labelStyle={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "2px" }}
              cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="c"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#${gradId})`}
              dot={false}
              activeDot={{ r: 3, fill: color, stroke: "var(--bg-base)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
