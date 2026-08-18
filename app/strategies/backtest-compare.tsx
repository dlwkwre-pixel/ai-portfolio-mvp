"use client";

import { useState } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { parseDay } from "@/lib/dates";

type CompareStrategy = { id: string; name: string };

type BacktestApiResult = {
  equity_curve: { date: string; value: number; benchmark: number }[];
  stats: { total_return_pct: number; max_drawdown_pct: number; sharpe_approx: number };
};

const LINE_COLORS = ["var(--brand-blue)", "var(--green)", "#a855f7", "#f59e0b", "var(--red)"];

const LOOKBACKS = [
  { id: "1Y", label: "1 year" },
  { id: "3Y", label: "3 years" },
] as const;

function compactDateLabel(value: string) {
  const parsed = parseDay(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
}

export default function BacktestComparePanel({ strategies }: { strategies: CompareStrategy[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [lookback, setLookback] = useState<"1Y" | "3Y">("1Y");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ id: string; name: string; stats: BacktestApiResult["stats"] }[] | null>(null);
  const [chartData, setChartData] = useState<Record<string, unknown>[] | null>(null);

  function toggle(id: string) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function runCompare() {
    if (selected.length < 2) { setError("Pick at least 2 strategies to compare."); return; }
    setLoading(true);
    setError(null);
    setRows(null);
    setChartData(null);
    try {
      const results = await Promise.all(selected.map(async (id) => {
        const res = await fetch("/api/strategies/backtest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy_id: id, lookback }),
        });
        const data = await res.json() as { result?: BacktestApiResult; error?: string };
        return { id, data };
      }));

      const failed = results.find((r) => !r.data.result);
      if (failed) { setError(`Couldn't backtest one of the selected strategies: ${failed.data.error ?? "unknown error"}`); return; }

      const byDate = new Map<string, Record<string, unknown>>();
      let benchmarkAdded = false;
      for (const { id, data } of results) {
        for (const point of data.result!.equity_curve) {
          const row = byDate.get(point.date) ?? { date: point.date };
          row[id] = point.value;
          if (!benchmarkAdded) row["SPY"] = point.benchmark;
          byDate.set(point.date, row);
        }
        benchmarkAdded = true;
      }

      setChartData([...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))));
      setRows(results.map(({ id, data }) => ({
        id,
        name: strategies.find((s) => s.id === id)?.name ?? id,
        stats: data.result!.stats,
      })));
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (strategies.length < 2) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "8px 16px", borderRadius: "var(--radius-xl)",
          border: "1px solid var(--card-border)", background: "var(--card-bg)",
          color: "var(--text-secondary)", fontFamily: "var(--font-body)",
          fontSize: "12px", fontWeight: 600, cursor: "pointer",
        }}>
        Compare strategies&apos; backtests →
      </button>
    );
  }

  return (
    <div className="bt-card" style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-display)" }}>
          Compare strategies
        </p>
        <button type="button" onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "15px", lineHeight: 1, padding: "2px" }}>
          ×
        </button>
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: 0, lineHeight: 1.6 }}>
        Overlays each strategy&apos;s mechanical risk-parameter backtest on one chart — same caveats as the per-strategy backtest apply to each line (simulated risk framework, not AI stock-picking replay).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {strategies.map((s) => (
          <button key={s.id} type="button" onClick={() => toggle(s.id)}
            style={{
              padding: "6px 12px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600,
              border: selected.includes(s.id) ? "1px solid rgba(37,99,235,0.4)" : "1px solid var(--card-border)",
              background: selected.includes(s.id) ? "rgba(37,99,235,0.12)" : "var(--card-bg)",
              color: selected.includes(s.id) ? "var(--brand-blue)" : "var(--text-tertiary)",
              cursor: "pointer",
            }}>
            {s.name}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
        <button type="button" onClick={runCompare} disabled={loading || selected.length < 2}
          style={{ padding: "7px 16px", borderRadius: "var(--radius-xl)", border: "none", background: "var(--brand-gradient)", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: loading ? "default" : "pointer", opacity: loading || selected.length < 2 ? 0.6 : 1 }}>
          {loading ? "Running…" : "Compare"}
        </button>
      </div>

      {error && <p style={{ fontSize: "12px", color: "var(--red)", margin: 0 }}>{error}</p>}

      {chartData && rows && (
        <>
          <div style={{ height: "260px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={compactDateLabel} stroke="var(--text-muted)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  labelFormatter={(label) => compactDateLabel(String(label))}
                  contentStyle={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "8px", color: "var(--text-primary)", fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                {rows.map((r, i) => (
                  <Line key={r.id} type="monotone" dataKey={r.id} name={r.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2.2} dot={false} connectNulls />
                ))}
                <Line type="monotone" dataKey="SPY" name="SPY" stroke="var(--text-muted)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "right" }}>
                  <th style={{ textAlign: "left", padding: "3px 6px" }}>Strategy</th>
                  <th style={{ padding: "3px 6px" }}>Return</th>
                  <th style={{ padding: "3px 6px" }}>Drawdown</th>
                  <th style={{ padding: "3px 6px" }}>Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ color: "var(--text-secondary)", textAlign: "right" }}>
                    <td style={{ textAlign: "left", padding: "3px 6px" }}>{r.name}</td>
                    <td style={{ padding: "3px 6px", color: r.stats.total_return_pct >= 0 ? "var(--green)" : "var(--red)" }}>
                      {r.stats.total_return_pct > 0 ? "+" : ""}{r.stats.total_return_pct.toFixed(1)}%
                    </td>
                    <td style={{ padding: "3px 6px" }}>-{r.stats.max_drawdown_pct.toFixed(1)}%</td>
                    <td style={{ padding: "3px 6px" }}>{r.stats.sharpe_approx.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
