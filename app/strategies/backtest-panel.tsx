"use client";

import { useEffect, useState } from "react";
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

type RegimeRow = {
  regime: string;
  days_pct: number;
  strategy_return_pct: number;
  trade_count: number;
  win_rate_pct: number;
};

type EquityPoint = { date: string; value: number; benchmark: number };

type BacktestResult = {
  equity_curve: EquityPoint[];
  stats: BacktestStats;
  regime_breakdown: RegimeRow[];
  universe_size: number;
  lookback: string;
  stop_loss_pct: number;
  position_size_pct: number;
  max_concurrent_positions: number;
  hold_window_days: number;
  disclaimer: string;
  saved_run_id: string | null;
};

type RunHistoryItem = {
  id: string;
  lookback: string;
  params_json: { stop_loss_pct: number; position_size_pct: number };
  stats_json: BacktestStats;
  created_at: string;
};

type SweepRow = {
  stop_loss_pct: number;
  is_current: boolean;
  total_return_pct: number;
  max_drawdown_pct: number;
  sharpe_approx: number;
  trade_count: number;
};

type Decision = {
  id: string;
  ticker: string | null;
  action: string;
  reasoning: string;
  source: string;
  created_at: string;
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

function fmtDelta(n: number): { text: string; color: string } {
  const sign = n > 0 ? "+" : "";
  return { text: `${sign}${n.toFixed(1)}pp`, color: n > 0 ? "var(--green)" : n < 0 ? "var(--red)" : "var(--text-muted)" };
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

  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [previousStats, setPreviousStats] = useState<BacktestStats | null>(null);

  const [sweeping, setSweeping] = useState(false);
  const [sweepRows, setSweepRows] = useState<SweepRow[] | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<Decision[] | null>(null);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/strategies/backtest?strategy_id=${card.id}`);
      const data = await res.json() as { runs?: RunHistoryItem[] };
      setHistory(data.runs ?? []);
    } catch {
      // Non-critical — history is a nice-to-have, don't surface a hard error for it.
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadDecisions() {
    try {
      const res = await fetch(`/api/strategies/decision-log?strategy_id=${card.id}`);
      const data = await res.json() as { decisions?: Decision[] };
      setDecisions(data.decisions ?? []);
    } catch {
      setDecisions([]);
    }
  }

  useEffect(() => {
    if (open) {
      loadHistory();
      loadDecisions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function run() {
    setLoading(true);
    setError(null);
    setSweepRows(null);
    const priorMostRecent = history[0] ?? null;
    try {
      const res = await fetch("/api/strategies/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: card.id, lookback, save: true }),
      });
      const data = await res.json() as { result?: BacktestResult; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? "Backtest failed."); return; }
      setResult(data.result ?? null);
      setPreviousStats(priorMostRecent ? priorMostRecent.stats_json : null);
      loadHistory();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadRun(runId: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/strategies/backtest?run_id=${runId}`);
      const data = await res.json() as { run?: { lookback: string; params_json: Record<string, number>; stats_json: BacktestStats; equity_curve_json: EquityPoint[] }; error?: string };
      if (!res.ok || data.error || !data.run) { setError(data.error ?? "Could not load that run."); return; }
      const r = data.run;
      const params = r.params_json as unknown as { stop_loss_pct: number; position_size_pct: number; max_concurrent_positions: number; hold_window_days: number; universe_size: number };
      setResult({
        equity_curve: r.equity_curve_json,
        stats: r.stats_json,
        regime_breakdown: [],
        universe_size: params.universe_size,
        lookback: r.lookback,
        stop_loss_pct: params.stop_loss_pct,
        position_size_pct: params.position_size_pct,
        max_concurrent_positions: params.max_concurrent_positions,
        hold_window_days: params.hold_window_days,
        disclaimer: "Loaded from a saved run — regime breakdown isn't stored historically, only computed fresh on new runs.",
        saved_run_id: runId,
      });
      setPreviousStats(null);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRun(runId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/strategies/backtest?run_id=${runId}`, { method: "DELETE" });
    loadHistory();
  }

  async function runSweep() {
    setSweeping(true);
    setSweepError(null);
    try {
      const res = await fetch("/api/strategies/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: card.id, lookback, sweep: true }),
      });
      const data = await res.json() as { sweep_result?: { values: SweepRow[] }; error?: string };
      if (!res.ok || data.error) { setSweepError(data.error ?? "Sweep failed."); return; }
      setSweepRows(data.sweep_result?.values ?? []);
    } catch {
      setSweepError("Network error — please try again.");
    } finally {
      setSweeping(false);
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

  const bestSweepIdx = sweepRows ? sweepRows.reduce((best, r, i) => r.sharpe_approx > sweepRows[best].sharpe_approx ? i : best, 0) : -1;

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
        <button type="button" onClick={runSweep} disabled={sweeping}
          style={{ padding: "7px 14px", borderRadius: "var(--radius-xl)", border: "1px solid rgba(37,99,235,0.28)", background: "rgba(37,99,235,0.08)", color: "var(--brand-blue)", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 600, cursor: sweeping ? "default" : "pointer", opacity: sweeping ? 0.6 : 1 }}>
          {sweeping ? "Sweeping…" : "Sweep stop-loss values"}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: "12px", color: "var(--red)", margin: 0 }}>{error}</p>
      )}

      {/* ── Run history ── */}
      {(historyLoading || history.length > 0) && (
        <div>
          <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 6px" }}>
            Run history
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "140px", overflowY: "auto" }}>
            {history.map((h) => (
              <button key={h.id} type="button" onClick={() => loadRun(h.id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
                  padding: "6px 9px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)",
                  background: result?.saved_run_id === h.id ? "rgba(37,99,235,0.1)" : "var(--bg-elevated)",
                  cursor: "pointer", textAlign: "left", fontFamily: "var(--font-body)",
                }}>
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {new Date(h.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {h.lookback} · stop {h.params_json.stop_loss_pct}%
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 600, color: h.stats_json.total_return_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                    {fmtPct(h.stats_json.total_return_pct)}
                  </span>
                  <span onClick={(e) => deleteRun(h.id, e)} role="button" aria-label="Delete run"
                    style={{ fontSize: "13px", color: "var(--text-muted)", cursor: "pointer", padding: "0 2px" }}>×</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Parameter sweep ── */}
      {sweepError && <p style={{ fontSize: "12px", color: "var(--red)", margin: 0 }}>{sweepError}</p>}
      {sweepRows && (
        <div>
          <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-blue)", margin: "0 0 6px" }}>
            Stop-loss sweep — same data, varied threshold
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: "3px 6px" }}>Stop-loss</th>
                  <th style={{ padding: "3px 6px" }}>Return</th>
                  <th style={{ padding: "3px 6px" }}>Drawdown</th>
                  <th style={{ padding: "3px 6px" }}>Sharpe</th>
                  <th style={{ padding: "3px 6px" }}>Trades</th>
                </tr>
              </thead>
              <tbody>
                {sweepRows.map((r, i) => (
                  <tr key={r.stop_loss_pct} style={{
                    background: i === bestSweepIdx ? "rgba(22,163,74,0.08)" : r.is_current ? "rgba(37,99,235,0.06)" : "transparent",
                    color: "var(--text-secondary)", textAlign: "right",
                  }}>
                    <td style={{ textAlign: "left", padding: "3px 6px", fontWeight: r.is_current ? 700 : 400 }}>
                      {r.stop_loss_pct}%{r.is_current ? " (current)" : ""}{i === bestSweepIdx ? " ★" : ""}
                    </td>
                    <td style={{ padding: "3px 6px", color: r.total_return_pct >= 0 ? "var(--green)" : "var(--red)" }}>{fmtPct(r.total_return_pct)}</td>
                    <td style={{ padding: "3px 6px" }}>-{r.max_drawdown_pct.toFixed(1)}%</td>
                    <td style={{ padding: "3px 6px" }}>{r.sharpe_approx.toFixed(2)}</td>
                    <td style={{ padding: "3px 6px" }}>{r.trade_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "6px 0 0" }}>★ = best risk-adjusted (Sharpe) of the values tested — not necessarily highest raw return.</p>
        </div>
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

          {previousStats && (
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", padding: "6px 10px" }}>
              <span>vs. previous run:</span>
              <span style={{ color: fmtDelta(result.stats.total_return_pct - previousStats.total_return_pct).color }}>
                return {fmtDelta(result.stats.total_return_pct - previousStats.total_return_pct).text}
              </span>
              <span style={{ color: fmtDelta(previousStats.max_drawdown_pct - result.stats.max_drawdown_pct).color }}>
                drawdown {fmtDelta(previousStats.max_drawdown_pct - result.stats.max_drawdown_pct).text}
              </span>
              <span style={{ color: fmtDelta(result.stats.sharpe_approx - previousStats.sharpe_approx).color }}>
                sharpe {fmtDelta(result.stats.sharpe_approx - previousStats.sharpe_approx).text}
              </span>
            </div>
          )}

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

          {result.regime_breakdown.length > 0 && (
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 6px" }}>
                Performance by market regime
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                  <thead>
                    <tr style={{ color: "var(--text-muted)", textAlign: "right" }}>
                      <th style={{ textAlign: "left", padding: "3px 6px" }}>Regime</th>
                      <th style={{ padding: "3px 6px" }}>% of days</th>
                      <th style={{ padding: "3px 6px" }}>Return</th>
                      <th style={{ padding: "3px 6px" }}>Trades</th>
                      <th style={{ padding: "3px 6px" }}>Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.regime_breakdown.map((r) => (
                      <tr key={r.regime} style={{ color: "var(--text-secondary)", textAlign: "right" }}>
                        <td style={{ textAlign: "left", padding: "3px 6px" }}>{r.regime}</td>
                        <td style={{ padding: "3px 6px" }}>{r.days_pct.toFixed(0)}%</td>
                        <td style={{ padding: "3px 6px", color: r.strategy_return_pct >= 0 ? "var(--green)" : "var(--red)" }}>{fmtPct(r.strategy_return_pct)}</td>
                        <td style={{ padding: "3px 6px" }}>{r.trade_count}</td>
                        <td style={{ padding: "3px 6px" }}>{r.trade_count > 0 ? `${r.win_rate_pct.toFixed(0)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "6px 0 0" }}>
                Regime is a simple price-based classification (SPY vs. its 50-day average, plus realized volatility) computed directly from this backtest&apos;s own data — not a historical lookup, since BuyTune&apos;s own regime tracking only goes back a few months.
              </p>
            </div>
          )}

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

      {/* ── Real trading activity, for eyeballing vs. the backtest above ── */}
      {decisions && decisions.length > 0 && (
        <div>
          <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: "0 0 6px" }}>
            Actual logged decisions (this strategy&apos;s live account)
          </p>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "0 0 6px" }}>
            Not a statistical comparison — just visibility into real decisions alongside the simulated numbers above.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "140px", overflowY: "auto" }}>
            {decisions.map((d) => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "5px 9px", borderRadius: "var(--radius-md)", background: "var(--bg-elevated)", fontSize: "11px" }}>
                <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                  {d.ticker ?? "—"} · {d.action}
                </span>
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {new Date(d.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
