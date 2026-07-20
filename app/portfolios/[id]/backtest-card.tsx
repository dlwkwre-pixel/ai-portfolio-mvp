"use client";

import { useState } from "react";
import InfoTooltip from "@/app/components/info-tooltip";

type Pt = { date: string; value: number };
type Stats = { endValue: number; totalReturn: number; cagr: number; maxDrawdown: number; series: Pt[] };
type Result = {
  available: boolean;
  reason?: string;
  range?: string;
  startDate?: string;
  endDate?: string;
  startValue?: number;
  coveragePct?: number;
  tickersUsed?: number;
  tickersTotal?: number;
  portfolio?: Stats;
  benchmark?: (Stats & { symbol: string }) | null;
};

const RANGES = ["1Y", "3Y", "5Y", "MAX"] as const;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString();
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

function Chart({ portfolio, benchmark, startValue }: { portfolio: Pt[]; benchmark: Pt[] | null; startValue: number }) {
  const all = [...portfolio.map((p) => p.value), ...(benchmark ?? []).map((p) => p.value), startValue];
  const min = Math.min(...all), max = Math.max(...all);
  const range = max - min || 1;
  const W = 320, H = 120, padY = 8;
  const x = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - padY - ((v - min) / range) * (H - 2 * padY);
  const path = (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i, pts.length).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const baseY = y(startValue);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "120px", display: "block" }}>
      <defs>
        <linearGradient id="bt-bt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(124,58,237,0.25)" />
          <stop offset="100%" stopColor="rgba(124,58,237,0)" />
        </linearGradient>
      </defs>
      {/* starting-value baseline */}
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="rgba(148,163,184,0.25)" strokeWidth="1" strokeDasharray="3 3" />
      {/* portfolio area + line */}
      <path d={`${path(portfolio)} L${W},${H} L0,${H} Z`} fill="url(#bt-bt-fill)" />
      <path d={path(portfolio)} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" />
      {/* benchmark line */}
      {benchmark && benchmark.length > 0 && (
        <path d={path(benchmark)} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 3" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function StatCol({ label, you, bench, invert = false }: { label: string; you: string; bench?: string; invert?: boolean }) {
  return (
    <div style={{ flex: 1, minWidth: "84px" }}>
      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>{you}</div>
      {bench != null && <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{bench}</div>}
    </div>
  );
}

export default function BacktestCard({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<(typeof RANGES)[number]>("3Y");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Result | null>(null);
  const [err, setErr] = useState("");

  async function run(r: (typeof RANGES)[number]) {
    setRange(r); setLoading(true); setErr("");
    try {
      const res = await fetch(`/api/portfolios/${portfolioId}/backtest?range=${r}`);
      const d = await res.json();
      if (!res.ok) { setErr(d?.error ?? "Backtest failed."); setData(null); return; }
      setData(d as Result);
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const p = data?.portfolio;
  const b = data?.benchmark;
  const beat = p && b ? p.totalReturn - b.totalReturn : null;

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
      <button type="button" onClick={() => { setOpen((o) => !o); if (!data && !loading) run(range); }}
        style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #818cf8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 5-6" /></svg>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>Backtest this allocation</h2>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {!open && (
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: "6px 0 0" }}>
          See how your current holdings, held since the start of the window, would have performed against the benchmark.
        </p>
      )}

      {open && (
        <div style={{ marginTop: "14px" }}>
          {/* Range selector */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
            {RANGES.map((r) => (
              <button key={r} type="button" onClick={() => run(r)} disabled={loading}
                style={{ padding: "5px 12px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: "var(--font-mono)",
                  border: `1px solid ${range === r ? "rgba(63,174,74,0.5)" : "var(--card-border)"}`,
                  background: range === r ? "rgba(63,174,74,0.12)" : "transparent",
                  color: range === r ? "var(--accent, #5fbf9a)" : "var(--text-tertiary)" }}>
                {r}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "30px", justifyContent: "center", color: "var(--text-muted)", fontSize: "12px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-blue)", opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
              Replaying {range} of history…
            </div>
          ) : err ? (
            <p style={{ fontSize: "12px", color: "var(--red)", padding: "10px 0" }}>{err}</p>
          ) : data && !data.available ? (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic", padding: "10px 0" }}>{data.reason ?? "Backtest unavailable."}</p>
          ) : p ? (
            <>
              {/* Headline */}
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                <span style={{ fontSize: "22px", fontWeight: 800, color: p.totalReturn >= 0 ? "var(--green)" : "var(--red)", fontFamily: "var(--font-mono)" }}>{fmt(p.endValue)}</span>
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>from {fmt(data!.startValue ?? 10000)} · {data!.startDate} → {data!.endDate}</span>
              </div>

              <Chart portfolio={p.series} benchmark={b?.series ?? null} startValue={data!.startValue ?? 10000} />

              {/* Legend */}
              <div style={{ display: "flex", gap: "16px", margin: "8px 0 14px", fontSize: "10.5px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--text-secondary)" }}>
                  <span style={{ width: "14px", height: "2px", background: "#3fae4a", display: "inline-block" }} /> Your allocation
                </span>
                {b && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--text-secondary)" }}>
                    <span style={{ width: "14px", height: "2px", background: "#64748b", display: "inline-block", borderTop: "1.5px dashed #64748b" }} /> {b.symbol}
                  </span>
                )}
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid var(--border-subtle)" }}>
                <StatCol label="Total return" you={pct(p.totalReturn)} bench={b ? `${b.symbol} ${pct(b.totalReturn)}` : undefined} />
                <StatCol label="Annualized" you={pct(p.cagr)} bench={b ? `${b.symbol} ${pct(b.cagr)}` : undefined} />
                <StatCol label="Max drawdown" you={pct(p.maxDrawdown)} bench={b ? `${b.symbol} ${pct(b.maxDrawdown)}` : undefined} invert />
              </div>

              {beat != null && (
                <div style={{ padding: "9px 12px", borderRadius: "var(--radius-md)", background: beat >= 0 ? "rgba(0,211,149,0.06)" : "rgba(245,158,11,0.06)", border: `1px solid ${beat >= 0 ? "rgba(0,211,149,0.2)" : "rgba(245,158,11,0.2)"}`, fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  <strong style={{ color: beat >= 0 ? "var(--green)" : "#f59e0b" }}>
                    {beat >= 0 ? "Beat" : "Trailed"} {b?.symbol} by {pct(Math.abs(beat)).replace("+", "")}
                  </strong>{" "}
                  over this window. {beat >= 0 ? "Past outperformance doesn't guarantee future results." : "A simpler index fund would have done better here."}
                </div>
              )}

              {data!.coveragePct != null && data!.coveragePct < 100 && (
                <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
                  Based on {data!.tickersUsed} of {data!.tickersTotal} holdings ({data!.coveragePct}% of value with price history). Buy-and-hold, dividend-adjusted, no rebalancing.
                </p>
              )}
              <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: data!.coveragePct != null && data!.coveragePct < 100 ? "4px" : "10px" }}>
                Hypothetical: replays today&apos;s weights through history. Not a prediction.
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
