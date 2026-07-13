"use client";

import { useState, useMemo } from "react";
import InfoTooltip from "@/app/components/info-tooltip";

export type SimHolding = { ticker: string; value: number; sector: string; beta: number | null };

type Row = SimHolding & { id: string; baselineValue: number; added?: boolean };

const fmt = (n: number) => "$" + Math.round(n).toLocaleString();
const fmtPct = (n: number) => `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;

type Metrics = {
  total: number;
  topWeight: number;
  topName: string;
  topSector: string;
  topSectorPct: number;
  weightedBeta: number | null;
  effectiveHoldings: number; // 1/HHI
};

function computeMetrics(rows: Row[]): Metrics {
  const live = rows.filter((r) => r.value > 0);
  const total = live.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return { total: 0, topWeight: 0, topName: "—", topSector: "—", topSectorPct: 0, weightedBeta: null, effectiveHoldings: 0 };

  let topWeight = 0, topName = "—";
  let hhi = 0;
  for (const r of live) {
    const w = r.value / total;
    hhi += w * w;
    if (w > topWeight) { topWeight = w; topName = r.ticker; }
  }

  const sectorMap = new Map<string, number>();
  for (const r of live) sectorMap.set(r.sector, (sectorMap.get(r.sector) ?? 0) + r.value);
  let topSector = "—", topSectorVal = 0;
  for (const [s, v] of sectorMap) if (v > topSectorVal) { topSectorVal = v; topSector = s; }

  let bSum = 0, bW = 0;
  for (const r of live) if (r.beta != null) { bSum += r.beta * r.value; bW += r.value; }
  const weightedBeta = bW > 0 ? bSum / bW : null;

  return {
    total,
    topWeight: topWeight * 100,
    topName,
    topSector,
    topSectorPct: (topSectorVal / total) * 100,
    weightedBeta,
    effectiveHoldings: hhi > 0 ? 1 / hhi : 0,
  };
}

function Delta({ before, after, suffix = "", invert = false, decimals = 1 }: { before: number; after: number; suffix?: string; invert?: boolean; decimals?: number }) {
  const diff = after - before;
  if (Math.abs(diff) < Math.pow(10, -decimals) / 2) return <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>no change</span>;
  // For risk metrics (concentration, beta) lower is "good" → invert color.
  const good = invert ? diff < 0 : diff > 0;
  const color = good ? "var(--green)" : "var(--red)";
  return (
    <span style={{ fontSize: "11px", fontWeight: 700, color, fontFamily: "var(--font-mono)" }}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(decimals)}{suffix}
    </span>
  );
}

function MetricRow({ label, hint, before, after, suffix = "", invert = false, decimals = 1 }: {
  label: string; hint: string; before: number; after: number; suffix?: string; invert?: boolean; decimals?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}>
        {label}
        <InfoTooltip text={hint} align="start" width={230}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "9px", fontWeight: 700 }}>?</span>
        </InfoTooltip>
      </span>
      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "right" }}>
        {before.toFixed(decimals)}{suffix} → <strong style={{ color: "var(--text-primary)" }}>{after.toFixed(decimals)}{suffix}</strong>
      </span>
      <span style={{ textAlign: "right", minWidth: "60px" }}><Delta before={before} after={after} suffix={suffix} invert={invert} decimals={decimals} /></span>
    </div>
  );
}

export default function WhatIfSimulator({ portfolioId, baseline }: { portfolioId: string; baseline: SimHolding[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => baseline.map((h, i) => ({ ...h, id: `${h.ticker}-${i}`, baselineValue: h.value })));
  const [newTicker, setNewTicker] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  const baseRows = useMemo<Row[]>(() => baseline.map((h, i) => ({ ...h, id: `${h.ticker}-${i}`, baselineValue: h.value })), [baseline]);
  const before = useMemo(() => computeMetrics(baseRows), [baseRows]);
  const after = useMemo(() => computeMetrics(rows), [rows]);

  const dirty = rows.some((r) => r.value !== r.baselineValue || r.added) || rows.length !== baseRows.length;

  function setValue(id: string, v: number) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value: Math.max(0, v) } : r)));
  }
  function removeRow(id: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, value: 0 } : r)));
  }
  function reset() {
    setRows(baseline.map((h, i) => ({ ...h, id: `${h.ticker}-${i}`, baselineValue: h.value })));
    setAddErr("");
  }

  async function addHolding() {
    const t = newTicker.trim().toUpperCase();
    const amt = Number(newAmount);
    if (!t) { setAddErr("Enter a ticker."); return; }
    if (!Number.isFinite(amt) || amt <= 0) { setAddErr("Enter a dollar amount."); return; }
    if (rows.some((r) => r.ticker === t)) { setAddErr(`${t} is already in the list — edit it above.`); return; }
    setAddErr("");
    setAdding(true);
    try {
      const res = await fetch(`/api/ticker-meta/${t}`);
      const d = await res.json();
      if (!res.ok) { setAddErr(d?.error ?? `Couldn't find ${t}.`); return; }
      setRows((prev) => [...prev, { ticker: t, value: amt, baselineValue: 0, sector: d.sector ?? "Other / Fund", beta: d.beta ?? null, id: `new-${t}-${Date.now()}`, added: true }]);
      setNewTicker(""); setNewAmount("");
    } catch {
      setAddErr("Network error. Try again.");
    } finally {
      setAdding(false);
    }
  }

  const drops = [10, 20, 30];

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #818cf8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: 0, flex: 1 }}>What-if trade simulator</h2>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>

      {!open && (
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: "6px 0 0" }}>
          Resize, remove, or add holdings and see the live impact on concentration, sector exposure, beta, and downside — before you trade.
        </p>
      )}

      {open && (
        <div style={{ marginTop: "14px" }}>
          {/* Editable holdings */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
            {rows.map((r) => {
              const removed = r.value <= 0;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "8px", opacity: removed ? 0.45 : 1 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", minWidth: "52px" }}>{r.ticker}</span>
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sector}{r.added ? " · added" : ""}</span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>$</span>
                  <input
                    type="number" min="0" value={r.value === 0 ? "" : Math.round(r.value)}
                    onChange={(e) => setValue(r.id, Number(e.target.value))}
                    placeholder="0"
                    style={{ width: "92px", background: "var(--bg-elevated, rgba(255,255,255,0.03))", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "5px 8px", fontSize: "12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", outline: "none", textAlign: "right" }}
                  />
                  <button type="button" onClick={() => removeRow(r.id)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "15px", lineHeight: 1, padding: "0 4px" }}><span aria-hidden="true">×</span><span className="bt-sr-only">Remove</span></button>
                </div>
              );
            })}
          </div>

          {/* Add a holding */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            <input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())} placeholder="Add ticker" maxLength={12}
              style={{ width: "100px", background: "var(--bg-elevated, rgba(255,255,255,0.03))", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "6px 9px", fontSize: "12px", color: "var(--text-primary)", outline: "none" }} />
            <input value={newAmount} onChange={(e) => setNewAmount(e.target.value)} type="number" min="0" placeholder="$ amount"
              style={{ width: "96px", background: "var(--bg-elevated, rgba(255,255,255,0.03))", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "6px 9px", fontSize: "12px", color: "var(--text-primary)", fontFamily: "var(--font-mono)", outline: "none" }} />
            <button type="button" onClick={addHolding} disabled={adding}
              style={{ padding: "6px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--card-border)", background: "var(--bg-elevated, rgba(255,255,255,0.04))", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: adding ? "wait" : "pointer", fontFamily: "var(--font-body)" }}>
              {adding ? "Adding…" : "+ Add"}
            </button>
            {dirty && (
              <button type="button" onClick={reset} style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)" }}>Reset</button>
            )}
            {addErr && <span style={{ fontSize: "11px", color: "var(--red)", width: "100%" }}>{addErr}</span>}
          </div>

          {/* Impact */}
          <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.14)", borderRadius: "var(--radius-md)", padding: "4px 14px 12px" }}>
            <MetricRow label="Total invested" hint="Sum of all simulated positions. Adding money raises it; trimming lowers it." before={before.total} after={after.total} decimals={0} suffix="" />
            <MetricRow label="Top-position weight" hint="The single largest holding as a % of the portfolio. Lower means less single-stock risk." before={before.topWeight} after={after.topWeight} suffix="%" invert />
            <MetricRow label="Top-sector weight" hint="Your most concentrated sector as a % of the portfolio. Lower is more diversified." before={before.topSectorPct} after={after.topSectorPct} suffix="%" invert />
            <MetricRow label="Effective holdings" hint="Diversification measure (1 / Herfindahl index). Higher means your money is spread across more positions, not piled into a few." before={before.effectiveHoldings} after={after.effectiveHoldings} decimals={1} />
            {(before.weightedBeta != null || after.weightedBeta != null) && (
              <MetricRow label="Portfolio beta" hint="Weighted market sensitivity. >1 amplifies market swings, <1 is steadier. Lower beta = calmer ride." before={before.weightedBeta ?? 1} after={after.weightedBeta ?? 1} decimals={2} invert />
            )}

            {/* Downside scenarios */}
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "8px", display: "flex", alignItems: "center" }}>
                Estimated downside
                <InfoTooltip text="Rough dollar loss if the market falls, using your portfolio's beta. A higher-beta portfolio falls more than the market; a lower-beta one falls less. Estimate only." align="start" width={240}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "14px", height: "14px", borderRadius: "50%", marginLeft: "5px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "9px", fontWeight: 700 }}>?</span>
                </InfoTooltip>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {drops.map((d) => {
                  const bBeta = before.weightedBeta ?? 1;
                  const aBeta = after.weightedBeta ?? 1;
                  const bLoss = before.total * (bBeta * d) / 100;
                  const aLoss = after.total * (aBeta * d) / 100;
                  return (
                    <div key={d} style={{ flex: 1, minWidth: "92px", padding: "9px 11px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.16)", borderRadius: "var(--radius-md)" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Market −{d}%</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--red)", fontFamily: "var(--font-mono)", marginTop: "2px" }}>−{fmt(aLoss)}</div>
                      {Math.abs(aLoss - bLoss) > 1 && (
                        <div style={{ fontSize: "9.5px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>was −{fmt(bLoss)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
            Simulation only — nothing is traded. Correlation isn&apos;t re-simulated; see the heatmap above for current correlations.
          </p>
        </div>
      )}
    </div>
  );
}
