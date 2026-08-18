"use client";

import { useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { parseDay } from "@/lib/dates";
import type { StrategyCard } from "./types";

type BacktestStats = {
  total_return_pct: number;
  benchmark_return_pct: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  avg_win_pct: number;
  avg_loss_pct: number;
  trade_count: number;
  sharpe_approx: number;
};

type BacktestResult = {
  equity_curve: { date: string; value: number; benchmark: number }[];
  stats: BacktestStats;
  universe_size: number;
  lookback: string;
  stop_loss_pct: number;
  position_size_pct: number;
  max_concurrent_positions: number;
  hold_window_days: number;
  disclaimer: string;
};

const LOOKBACKS = [
  { id: "1Y", label: "1 year" },
  { id: "3Y", label: "3 years" },
  { id: "5Y", label: "5 years" },
] as const;

function compactDateLabel(value: string) {
  const parsed = parseDay(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
}

function fmtPct(n: number, withSign = true): string {
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{label}</div>
      <div style={{ fontSize: "13px", fontWeight: 600, color: color ?? "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

export default function BacktestPanel({ card }: { card: StrategyCard }) {
  const [open, setOpen] = useState(false);
  const [lookback, setLookback] = useState<"1Y" | "3Y" | "5Y">("1Y");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/strategies/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: card.id, lookback }),
      });
      const data = await res.json() as { result?: BacktestResult; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? "Backtest failed."); return; }
      setResult(data.result ?? null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "7px 14px", borderRadius: "var(--radius-xl)",
          border: "1px solid rgba(37,99,235,0.22)", background: "rgba(37,99,235,0.06)",
          color: "var(--brand-blue)", fontFamily: "var(--font-body)",
          fontSize: "12px", fontWeight: 600, cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.12)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.06)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M2 2v11a1 1 0 001 1h11" stroke="var(--brand-blue)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 10l3-3 2.5 2.5L14 5" stroke="var(--brand-blue)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Backtest
      </button>
    );
  }

  return (
    <div style={{ background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.15)", borderRadius: "var(--radius-lg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--brand-blue)", boxShadow: "0 0 6px rgba(37,99,235,0.5)" }} />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--brand-blue)", fontFamily: "var(--font-body)" }}>Backtest</span>
        </div>
        <button type="button" onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "15px", lineHeight: 1, padding: "2px" }}>
          ×
        </button>
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: 0 }}>
        Tests this strategy&apos;s numeric risk parameters (position sizing, stop-loss, cash range, trade pacing) against real historical prices using a fixed momentum/volume trigger as a stand-in for &ldquo;the AI found a candidate.&rdquo; This does <strong>not</strong> replay whether Atlas&apos;s actual stock picks would have been good — that can&apos;t be tested historically.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", gap: "3px", padding: "3px", borderRadius: "var(--radius-lg)", background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
          {LOOKBACKS.map((lb) => (
            <button key={lb.id} type="button" onClick={() => setLookback(lb.id)}
              style={{
                padding: "5px 11px", borderRadius: "var(--radius-md)", fontSize: "11px", fontWeight: 600,
                border: "none", cursor: "pointer",
                background: lookback === lb.id ? "rgba(37,99,235,0.15)" : "transparent",
                color: lookback === lb.id ? "var(--brand-blue)" : "var(--text-tertiary)",
              }}>
              {lb.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={run} disabled={loading}
          style={{ padding: "7px 16px", borderRadius: "var(--radius-xl)", border: "none", background: "var(--brand-gradient)", color: "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Running…" : result ? "Run again" : "Run backtest"}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red)", margin: 0 }}>{error}</p>
      )}

      {result && !loading && (
        <>
          <div style={{ height: "220px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.equity_curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={compactDateLabel} stroke="var(--text-muted)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `${Number(v).toFixed(0)}`} />
                <Tooltip
                  formatter={(value, name) => [`${Number(value).toFixed(1)}`, name === "value" ? "Strategy" : "SPY"]}
                  labelFormatter={(label) => compactDateLabel(String(label))}
                  contentStyle={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "12px" }}
                />
                <Line type="monotone" dataKey="value" name="value" stroke="var(--brand-blue)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="benchmark" name="benchmark" stroke="var(--text-muted)" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px" }}>
            <StatCell label="Total return" value={fmtPct(result.stats.total_return_pct)} color={result.stats.total_return_pct >= 0 ? "var(--green)" : "var(--red)"} />
            <StatCell label="SPY return" value={fmtPct(result.stats.benchmark_return_pct)} />
            <StatCell label="Max drawdown" value={`-${result.stats.max_drawdown_pct.toFixed(1)}%`} color="var(--red)" />
            <StatCell label="Win rate" value={`${result.stats.win_rate_pct.toFixed(0)}%`} />
            <StatCell label="Avg win" value={fmtPct(result.stats.avg_win_pct)} color="var(--green)" />
            <StatCell label="Avg loss" value={fmtPct(result.stats.avg_loss_pct)} color="var(--red)" />
            <StatCell label="Trades" value={String(result.stats.trade_count)} />
            <StatCell label="Sharpe (approx)" value={result.stats.sharpe_approx.toFixed(2)} />
          </div>

          <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", flexWrap: "wrap", gap: "10px", fontFamily: "var(--font-mono)" }}>
            <span>Universe: {result.universe_size} tickers</span>
            <span>Stop-loss used: {result.stop_loss_pct}%</span>
            <span>Position size: {result.position_size_pct}%</span>
            <span>Max concurrent: {result.max_concurrent_positions}</span>
            <span>Hold window: {result.hold_window_days}d</span>
          </div>

          <p style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
            {result.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}
