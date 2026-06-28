"use client";

import { useState, useEffect } from "react";
import InfoTooltip from "@/app/components/info-tooltip";

type Sector = { label: string; value: number; pct: number };
type Correlation = { tickers: string[]; matrix: number[][] };
type Data = { sectors: Sector[]; correlation: Correlation | null; totalValue: number };

const PALETTE = ["#2563eb", "#7c3aed", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b", "#84cc16", "#a855f7"];
const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

function Hint({ text }: { text: string }) {
  return (
    <InfoTooltip text={text} align="start" width={240}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "15px", height: "15px", borderRadius: "50%", marginLeft: "6px", cursor: "help", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", color: "var(--accent, #818cf8)", fontSize: "10px", fontWeight: 700 }}>?</span>
    </InfoTooltip>
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
                  <div key={`h-${t}`} style={{ fontSize: "8.5px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", textAlign: "center", padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</div>
                ))}
                {corr.tickers.map((rt, i) => (
                  <div key={`row-${rt}`} style={{ display: "contents" }}>
                    <div style={{ fontSize: "8.5px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: "5px" }}>{rt}</div>
                    {corr.matrix[i].map((v, j) => (
                      <div key={`${i}-${j}`} title={`${corr.tickers[i]} ↔ ${corr.tickers[j]}: ${v.toFixed(2)}`} style={{
                        aspectRatio: "1", minWidth: "26px", display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: "4px", fontSize: "9px", fontWeight: 700, fontFamily: "var(--font-mono)",
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
    </div>
  );
}
