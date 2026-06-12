"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { trimSnapshotsBefore } from "@/app/portfolios/[id]/actions";

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

function formatChange(delta: number) {
  const abs = Math.abs(delta);
  const prefix = delta >= 0 ? "+" : "-";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(1)}k`;
  return `${prefix}$${abs.toFixed(0)}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type TooltipProps = {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  isPrivate: boolean;
  startVal: number;
};

function ChartTooltip({ active, payload, label, isPrivate, startVal }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const delta = val - startVal;
  const pct = startVal > 0 ? (delta / startVal) * 100 : 0;
  const isUp = pct >= 0;
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "10px 14px", fontSize: "12px" }}>
      <div style={{ color: "var(--text-muted)", marginBottom: "4px" }}>{label ? formatDate(label) : ""}</div>
      <div style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: "14px" }}>
        {isPrivate ? "••••••" : formatMoney(val)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: isUp ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
        {isPrivate ? `${isUp ? "+" : ""}${pct.toFixed(2)}%` : `${formatChange(delta)} (${isUp ? "+" : ""}${pct.toFixed(2)}%)`}
      </div>
    </div>
  );
}

type View = "portfolio" | "networth";

export default function CombinedChartClient({
  data,
  portfolioIds = [],
  netWorthData = [],
}: {
  data: CombinedChartPoint[];
  portfolioIds?: string[];
  netWorthData?: CombinedChartPoint[];
}) {
  const [view, setView] = useState<View>("portfolio");
  const [tfDays, setTfDays] = useState(0);
  const [isPrivate, setIsPrivate] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("bt-privacy-mode") === "true"; } catch { return false; }
  });
  const [showTrim, setShowTrim] = useState(false);
  const [trimDate, setTrimDate] = useState("");
  const [trimStatus, setTrimStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasNetWorth = netWorthData.length >= 2;
  const activeData = view === "networth" && hasNetWorth ? netWorthData : data;

  function handleTrim() {
    if (!trimDate || portfolioIds.length === 0) return;
    startTransition(async () => {
      let total = 0;
      for (const pid of portfolioIds) {
        const result = await trimSnapshotsBefore(pid, trimDate);
        total += result.deleted;
      }
      setTrimStatus(`Removed ${total} snapshot${total !== 1 ? "s" : ""} before ${new Date(trimDate + "T12:00:00").toLocaleDateString()}. Refresh to see the updated chart.`);
      setShowTrim(false);
    });
  }

  useEffect(() => {
    const onPrivacyChange = () => {
      try { setIsPrivate(localStorage.getItem("bt-privacy-mode") === "true"); } catch {}
    };
    window.addEventListener("bt-privacy-change", onPrivacyChange);
    return () => window.removeEventListener("bt-privacy-change", onPrivacyChange);
  }, []);

  const filtered = useMemo(() => filterByDays(activeData, tfDays), [activeData, tfDays]);

  const startVal   = filtered[0]?.total ?? 0;
  const endVal     = filtered[filtered.length - 1]?.total ?? 0;
  const delta      = endVal - startVal;
  const changePct  = startVal > 0 ? (delta / startVal) * 100 : 0;
  const isUp       = changePct >= 0;
  const lineColor  = isUp ? "#00d395" : "#fb7185";

  const minVal  = Math.min(...filtered.map(d => d.total));
  const maxVal  = Math.max(...filtered.map(d => d.total));
  const padding = (maxVal - minVal) * 0.08 || maxVal * 0.05;

  // View toggle pill
  const viewToggle = hasNetWorth ? (
    <div style={{
      display: "flex",
      background: "rgba(255,255,255,0.05)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "8px",
      padding: "2px",
      gap: "2px",
    }}>
      {(["portfolio", "networth"] as View[]).map((v) => {
        const active = view === v;
        return (
          <button
            key={v}
            onClick={() => { setView(v); setShowTrim(false); setTrimStatus(null); }}
            style={{
              padding: "3px 10px",
              borderRadius: "6px",
              fontSize: "10px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              transition: "all 120ms",
              background: active ? "rgba(37,99,235,0.20)" : "transparent",
              color: active ? "var(--brand-blue)" : "var(--text-muted)",
            }}
          >
            {v === "portfolio" ? "Portfolio" : "Net Worth"}
          </button>
        );
      })}
    </div>
  ) : null;

  if (filtered.length < 2) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {view === "networth" ? "Net Worth" : "Total Portfolio Value"}
          </div>
          {viewToggle}
        </div>
        <div style={{ padding: "20px 0", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
          {view === "networth"
            ? "No net worth history yet — update your balance sheet in Planning to start tracking."
            : "Not enough snapshots yet — more data will appear as you use the app."}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header row: label + view toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>
          {view === "networth" ? "Net Worth" : "Total Portfolio Value"}
        </div>
        {viewToggle}
      </div>

      {/* Value + timeframe row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {isPrivate ? "••••••" : formatMoney(endVal)}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "5px", marginTop: "2px" }}>
            {!isPrivate && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: isUp ? "var(--green)" : "var(--red)" }}>
                {formatChange(delta)}
              </span>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: isUp ? "var(--green)" : "var(--red)" }}>
              ({isUp ? "+" : ""}{changePct.toFixed(2)}%)
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>this period</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
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
          {view === "portfolio" && (
            <button
              onClick={() => { setShowTrim(t => !t); setTrimStatus(null); }}
              style={{ marginLeft: "6px", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: "2px" }}
            >
              Fix chart
            </button>
          )}
        </div>
      </div>

      {trimStatus && (
        <div style={{ fontSize: "11px", color: "var(--green)", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>{trimStatus}</span>
          <button onClick={() => { setTrimStatus(null); window.location.reload(); }} style={{ color: "var(--text-muted)", fontSize: "10px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Refresh now</button>
        </div>
      )}

      {showTrim && view === "portfolio" && (
        <div style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", fontSize: "11px" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "6px" }}>
            Remove all chart history before this date across all portfolios.
          </p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="date"
              value={trimDate}
              onChange={(e) => setTrimDate(e.target.value)}
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "4px 8px", fontSize: "11px", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleTrim}
              disabled={isPending || !trimDate}
              style={{ fontSize: "11px", fontWeight: 600, color: "#f59e0b", background: "none", border: "none", cursor: "pointer", opacity: isPending || !trimDate ? 0.4 : 1 }}
            >
              {isPending ? "Trimming…" : "Remove those snapshots"}
            </button>
            <button onClick={() => setShowTrim(false)} style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
            tickFormatter={isPrivate ? () => "•••" : formatMoney}
            tick={{ fontSize: 9, fill: "var(--text-muted)" }}
            axisLine={false}
            tickLine={false}
            width={isPrivate ? 28 : 52}
          />
          <Tooltip content={<ChartTooltip isPrivate={isPrivate} startVal={startVal} />} />
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
