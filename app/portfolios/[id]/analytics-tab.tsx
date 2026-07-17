"use client";

import { useState, useEffect } from "react";
import InfoTooltip from "@/app/components/info-tooltip";
import WhatIfSimulator, { type SimHolding } from "./what-if-simulator";
import BacktestCard from "./backtest-card";

type Sector = { label: string; value: number; pct: number };
type Correlation = { tickers: string[]; matrix: number[][] };
type FactorTilt = {
  analyzedValue: number;
  styleCoveragePct: number;
  sizeCoveragePct: number;
  style: { value: number; blend: number; growth: number };
  size: { large: number; mid: number; small: number };
  weightedPe: number | null;
  weightedBeta: number | null;
  weightedDividendYield: number | null;
  weightedMomentum: number | null;
  headline: string;
};
type HarvestCandidate = { ticker: string; purchasedAt: string; shares: number; costPerShare: number; price: number; loss: number; longTerm: boolean; washSaleRisk: boolean };
type Harvest = { taxable: boolean; totalLoss: number; stLoss: number; ltLoss: number; candidates: HarvestCandidate[] };
type Data = { sectors: Sector[]; correlation: Correlation | null; factors: FactorTilt | null; holdings?: SimHolding[]; totalValue: number; harvest?: Harvest | null };

const PALETTE = ["#2563eb", "#7c3aed", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b", "#84cc16", "#a855f7"];
const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

function Hint({ text }: { text: string }) {
  return (
    <InfoTooltip text={text} align="start" width={240}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "15px", height: "15px", borderRadius: "50%", marginLeft: "6px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
  );
}

// A two/three-segment labeled bar for the style and size splits.
function SplitBar({ segments }: { segments: { label: string; pct: number; color: string }[] }) {
  const shown = segments.filter((s) => s.pct > 0);
  return (
    <div>
      <div style={{ display: "flex", height: "13px", borderRadius: "7px", overflow: "hidden", background: "rgba(148,163,184,0.12)" }}>
        {shown.map((s, i) => (
          <div key={s.label} className="bt-an-seg" title={`${s.label} ${s.pct}%`} style={{ width: `${s.pct}%`, background: s.color, animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", marginTop: "8px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: s.color, flexShrink: 0, opacity: s.pct > 0 ? 1 : 0.3 }} />
            <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
            <span style={{ color: s.pct > 0 ? "var(--text-primary)" : "var(--text-muted)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactorStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ flex: 1, minWidth: "78px", padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center" }}>
        {label}{hint && <Hint text={hint} />}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)", marginTop: "3px" }}>{value}</div>
    </div>
  );
}

// High positive correlation = warm (moves together = concentrated); low/negative = cool (diversifying).
function corrColor(v: number): string {
  if (v >= 0.7) return "rgba(239,68,68,0.85)";
  if (v >= 0.4) return "rgba(245,158,11,0.8)";
  if (v >= 0.15) return "rgba(148,163,184,0.45)";
  if (v >= -0.15) return "rgba(16,185,129,0.55)";
  return "rgba(6,182,212,0.7)";
}

export default function AnalyticsTab({ portfolioId }: { portfolioId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    // loading starts true / err false from initial state; portfolioId is stable per mount.
    let cancelled = false;
    fetch(`/api/portfolios/${portfolioId}/analytics`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: Data) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setErr(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [portfolioId]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "40px", justifyContent: "center", color: "var(--text-muted)", fontSize: "13px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-blue)", opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
        Analyzing exposure and correlations…
      </div>
    );
  }
  if (err || !data || data.sectors.length === 0) {
    return <p style={{ fontSize: "13px", color: "var(--text-tertiary)", fontStyle: "italic", textAlign: "center", padding: "30px" }}>Add some holdings to see your exposure and correlation analysis.</p>;
  }

  const corr = data.correlation;
  // Average off-diagonal correlation → a one-line diversification read.
  let avgCorr: number | null = null;
  if (corr && corr.tickers.length >= 2) {
    let sum = 0, n = 0;
    for (let i = 0; i < corr.matrix.length; i++) for (let j = 0; j < corr.matrix.length; j++) if (i !== j) { sum += corr.matrix[i][j]; n++; }
    avgCorr = n > 0 ? sum / n : null;
  }
  const divRead = avgCorr == null ? null
    : avgCorr >= 0.7 ? { text: "Your top holdings move together a lot — limited diversification. A shock to one likely hits the others.", color: "var(--red)" }
    : avgCorr >= 0.4 ? { text: "Moderate correlation across your top holdings — some shared risk, some diversification.", color: "#f59e0b" }
    : { text: "Nicely diversified — your top holdings don't move in lockstep, which smooths volatility.", color: "var(--green)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <style>{`@keyframes bt-an-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}} .bt-an-seg{transform-origin:left;animation:bt-an-grow .7s cubic-bezier(0.16,1,0.3,1) both}`}</style>

      {/* Sector / asset exposure */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 14px", display: "flex", alignItems: "center" }}>
          Exposure X-ray <Hint text="Where your money actually sits by sector. Concentration in one sector means your portfolio rises and falls with that sector's fortunes — even if you hold many tickers." />
        </h2>
        <div style={{ display: "flex", height: "16px", borderRadius: "8px", overflow: "hidden", marginBottom: "14px", background: "rgba(148,163,184,0.12)" }}>
          {data.sectors.map((s, i) => (
            <div key={s.label} className="bt-an-seg" style={{ width: `${s.pct}%`, background: PALETTE[i % PALETTE.length], animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          {data.sectors.map((s, i) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "9px", fontSize: "12.5px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{fmt(s.value)}</span>
              <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", width: "34px", textAlign: "right" }}>{s.pct}%</span>
            </div>
          ))}
        </div>
        {data.sectors[0] && data.sectors[0].pct >= 40 && (
          <div style={{ marginTop: "12px", padding: "9px 12px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "var(--radius-md)", fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <strong style={{ color: "#f59e0b" }}>{data.sectors[0].pct}% in {data.sectors[0].label}.</strong> That&apos;s heavy concentration — consider whether you want that much riding on one sector.
          </div>
        )}
      </div>

      {/* Factor / style tilt */}
      {data.factors && (data.factors.styleCoveragePct > 0 || data.factors.sizeCoveragePct > 0) && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center" }}>
            Factor tilt <Hint text="What kind of stocks you actually own, by value: their size (large/mid/small cap), their style (value vs growth), and your blended P/E, beta, yield and 12-month momentum. Built from free fundamentals — funds and uncovered tickers are excluded." />
          </h2>
          <p style={{ fontSize: "12px", color: "var(--accent, #818cf8)", fontWeight: 600, margin: "0 0 14px", textTransform: "capitalize" }}>{data.factors.headline}</p>

          {data.factors.styleCoveragePct > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center" }}>
                Value ↔ Growth <Hint text="Value = cheaper on earnings/book (low P/E, low P/B). Growth = pricier, faster-growing (high P/E, strong revenue/EPS growth). Blend is in between." />
              </div>
              <SplitBar segments={[
                { label: "Value", pct: data.factors.style.value, color: "var(--green)" },
                { label: "Blend", pct: data.factors.style.blend, color: "var(--text-tertiary)" },
                { label: "Growth", pct: data.factors.style.growth, color: "#7c3aed" },
              ]} />
            </div>
          )}

          {data.factors.sizeCoveragePct > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center" }}>
                Company size <Hint text="Large-cap ≥ $10B (steadier), mid-cap $2–10B, small-cap < $2B (more volatile, more upside). A heavy small-cap tilt means bumpier rides." />
              </div>
              <SplitBar segments={[
                { label: "Large", pct: data.factors.size.large, color: "#2563eb" },
                { label: "Mid", pct: data.factors.size.mid, color: "#06b6d4" },
                { label: "Small", pct: data.factors.size.small, color: "#f59e0b" },
              ]} />
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {data.factors.weightedPe !== null && (
              <FactorStat label="Blended P/E" value={`${data.factors.weightedPe}`} hint="Value-weighted price-to-earnings of your stock holdings. Higher = the market is paying more per dollar of earnings (growth expectations)." />
            )}
            {data.factors.weightedBeta !== null && (
              <FactorStat label="Beta" value={`${data.factors.weightedBeta}`} hint="How much your holdings move vs the market. 1.0 = moves with it; >1 amplifies swings; <1 is steadier." />
            )}
            {data.factors.weightedDividendYield !== null && data.factors.weightedDividendYield > 0 && (
              <FactorStat label="Div yield" value={`${data.factors.weightedDividendYield}%`} hint="Blended dividend yield — the income your holdings pay relative to price." />
            )}
            {data.factors.weightedMomentum !== null && (
              <FactorStat label="12m return" value={`${data.factors.weightedMomentum > 0 ? "+" : ""}${data.factors.weightedMomentum}%`} hint="Value-weighted 52-week price return of your holdings — a momentum read on what you own." />
            )}
          </div>

          {data.factors.styleCoveragePct < 100 && (
            <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "12px" }}>
              Based on {data.factors.styleCoveragePct}% of analyzed value. Funds and tickers without fundamentals are excluded.
            </p>
          )}
        </div>
      )}

      {/* Correlation heatmap */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center" }}>
          Correlation heatmap <Hint text="How tightly your top holdings move together over the last ~6 months. 1.0 = move in lockstep (concentrated risk); near 0 = independent (diversifying); negative = hedge each other. Warm cells = high correlation." />
        </h2>
        <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 14px" }}>Top holdings · daily returns, ~6 months</p>

        {!corr ? (
          <p style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic" }}>Not enough price history available to compute correlations (need at least two holdings with daily data).</p>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <div style={{ display: "inline-grid", gridTemplateColumns: `44px repeat(${corr.tickers.length}, 1fr)`, gap: "2px", minWidth: "100%" }}>
                <div />
                {corr.tickers.map((t) => (
                  <div key={`h-${t}`} style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "center", padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</div>
                ))}
                {corr.tickers.map((rt, i) => (
                  <div key={`row-${rt}`} style={{ display: "contents" }}>
                    <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "5px" }}>{rt}</div>
                    {corr.matrix[i].map((v, j) => (
                      <div key={`${i}-${j}`} title={`${corr.tickers[i]} ↔ ${corr.tickers[j]}: ${v.toFixed(2)}`} style={{
                        aspectRatio: "1", minWidth: "26px", display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: "4px", fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)",
                        background: i === j ? "rgba(99,102,241,0.18)" : corrColor(v),
                        color: i === j ? "var(--accent, #818cf8)" : (v >= 0.4 || v < -0.15 ? "#fff" : "var(--text-secondary)"),
                      }}>{i === j ? "—" : v.toFixed(1)}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {divRead && (
              <div style={{ marginTop: "14px", padding: "10px 13px", background: `color-mix(in srgb, ${divRead.color} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${divRead.color} 22%, transparent)`, borderRadius: "var(--radius-md)" }}>
                <p style={{ fontSize: "11.5px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
                  <strong style={{ color: divRead.color }}>Avg correlation {avgCorr!.toFixed(2)}.</strong> {divRead.text}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Tax-loss harvesting scanner (taxable accounts with real lots) */}
      {data.harvest && data.harvest.taxable && data.harvest.candidates.length > 0 && (
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", display: "flex", alignItems: "center" }}>
            Tax-loss harvesting <Hint text="Lots trading below what you paid. Selling them realizes a loss that can offset capital gains (and up to $3,000/yr of ordinary income). ⚠ wash sale = you bought this ticker within the last 30 days, so selling now would disallow the loss. Not tax advice — timing and your full tax picture matter." />
          </h2>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 12px" }}>
            Harvestable losses: <strong style={{ fontFamily: "var(--font-mono)", color: "var(--red)" }}>${data.harvest.totalLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
            {" "}(<span style={{ fontFamily: "var(--font-mono)" }}>${data.harvest.stLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> short-term · <span style={{ fontFamily: "var(--font-mono)" }}>${data.harvest.ltLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> long-term)
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px" }}>
              <thead>
                <tr>
                  {["Ticker", "Bought", "Shares", "Cost", "Now", "Loss", "Term", ""].map((h) => (
                    <th key={h} style={{ textAlign: h === "Ticker" ? "left" : "right", padding: "5px 8px", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", borderBottom: "1px solid var(--card-border)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.harvest.candidates.map((c, i) => (
                  <tr key={`${c.ticker}-${c.purchasedAt}-${i}`}>
                    <td style={{ padding: "7px 8px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)" }}>{c.ticker}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{c.purchasedAt}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>{c.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>${c.costPerShare.toLocaleString()}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-subtle)" }}>${c.price.toLocaleString()}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--red)", borderBottom: "1px solid var(--border-subtle)" }}>−${c.loss.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", fontSize: "10px", color: c.longTerm ? "var(--text-tertiary)" : "#f59e0b", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{c.longTerm ? "Long" : "Short"}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>
                      {c.washSaleRisk && <span title="You bought this ticker in the last 30 days — selling at a loss now would trigger the wash-sale rule and disallow the deduction." style={{ fontSize: "10px", fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "999px", padding: "2px 7px", cursor: "help" }}>⚠ wash sale</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", margin: "10px 0 0", lineHeight: 1.5 }}>
            Informational only, not tax advice. Losses shown are per-lot and unrealized; trades happen at your brokerage.
          </p>
        </div>
      )}
      {data.harvest && !data.harvest.taxable && (
        <p style={{ fontSize: "10.5px", color: "var(--text-muted)", margin: "-6px 0 0", padding: "0 4px" }}>
          Tax-loss harvesting isn&apos;t shown for tax-advantaged accounts (losses inside an IRA/401k aren&apos;t deductible).
        </p>
      )}

      {/* What-if trade simulator */}
      {data.holdings && data.holdings.length > 0 && (
        <WhatIfSimulator portfolioId={portfolioId} baseline={data.holdings} />
      )}

      {/* Backtest current allocation */}
      <BacktestCard portfolioId={portfolioId} />
    </div>
  );
}
