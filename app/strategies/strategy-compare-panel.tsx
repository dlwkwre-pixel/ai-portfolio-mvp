"use client";

import { useEffect, useState } from "react";
import type { StrategyCard } from "./types";
import type { StrategyAnalysis } from "@/app/api/strategies/analyze/route";

const FV = {
  bg:     "rgba(109,40,217,0.05)",
  bgMed:  "rgba(109,40,217,0.10)",
  border: "rgba(109,40,217,0.18)",
  accent: "#7c3aed",
} as const;

const FACTORS = [
  "Risk Alignment",
  "Diversification",
  "Tax Efficiency",
  "Drawdown Resilience",
  "Long-Term Compounding",
  "Emotional Durability",
  "Concentration Risk",
  "Volatility Management",
] as const;

const THINKING = [
  "Reading strategy parameters…",
  "Calibrating factor scores…",
  "Building investment thesis…",
  "Running parallel analysis…",
  "Identifying divergences…",
];

async function runAnalysis(card: StrategyCard): Promise<StrategyAnalysis> {
  const v = card.latest_version;
  const res = await fetch("/api/strategies/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: card.name,
      style: card.style,
      risk_level: card.risk_level,
      turnover_preference: v?.turnover_preference ?? null,
      holding_period_bias: v?.holding_period_bias ?? null,
      max_position_pct: v?.max_position_pct ?? null,
      min_position_pct: v?.min_position_pct ?? null,
      cash_min_pct: v?.cash_min_pct ?? null,
      cash_max_pct: v?.cash_max_pct ?? null,
      prompt_text: v?.prompt_text ?? null,
      description: card.description,
    }),
  });
  const data = await res.json() as { analysis?: StrategyAnalysis; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? "Analysis failed");
  if (!data.analysis) throw new Error("No analysis returned");
  return data.analysis;
}

function scoreColor(s: number) {
  if (s >= 80) return "var(--green)";
  if (s >= 60) return "var(--amber)";
  return "var(--red)";
}

function ParamChip({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
        {label}
      </span>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
        {value}
      </span>
    </div>
  );
}

function StrategyHeader({ card, label }: { card: StrategyCard; label: "A" | "B" }) {
  const v = card.latest_version;
  const isA = label === "A";
  return (
    <div style={{
      padding: "14px 16px",
      background: isA ? "rgba(37,99,235,0.06)" : "rgba(168,85,247,0.06)",
      border: `1px solid ${isA ? "rgba(37,99,235,0.15)" : "rgba(168,85,247,0.15)"}`,
      borderRadius: "10px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <span style={{
          fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          padding: "2px 7px", borderRadius: "4px",
          background: isA ? "rgba(37,99,235,0.15)" : "rgba(168,85,247,0.15)",
          color: isA ? "#60a5fa" : "#c084fc",
          fontFamily: "var(--font-mono)", flexShrink: 0, marginTop: "2px",
        }}>
          {label}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.2px", lineHeight: 1.3 }}>
          {card.name}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <ParamChip label="Style" value={card.style} />
        <ParamChip label="Risk" value={card.risk_level} />
        <ParamChip label="Turnover" value={v?.turnover_preference ?? null} />
        <ParamChip label="Horizon" value={v?.holding_period_bias ?? null} />
        {v?.max_position_pct != null && (
          <ParamChip label="Max position" value={`${v.max_position_pct}%`} />
        )}
        {v?.cash_min_pct != null && v.cash_max_pct != null && (
          <ParamChip label="Cash range" value={`${v.cash_min_pct}–${v.cash_max_pct}%`} />
        )}
      </div>
    </div>
  );
}

function ConfidenceVs({ scoreA, scoreB }: { scoreA: number; scoreB: number }) {
  const delta = scoreA - scoreB;
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr auto 1fr",
      gap: "12px", alignItems: "center",
      background: "var(--surface-002)", border: "1px solid var(--line-006)",
      borderRadius: "10px", padding: "14px 16px",
    }}>
      {/* A */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: scoreColor(scoreA), lineHeight: 1 }}>
          {scoreA}
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "3px", fontFamily: "var(--font-body)" }}>
          Atlas Confidence A
        </div>
      </div>
      {/* vs badge */}
      <div style={{
        fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", fontFamily: "var(--font-mono)",
        background: "var(--surface-004)", border: "1px solid var(--line-006)",
        borderRadius: "6px", padding: "4px 8px",
      }}>
        VS
      </div>
      {/* B */}
      <div style={{ textAlign: "left" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: scoreColor(scoreB), lineHeight: 1 }}>
          {scoreB}
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "3px", fontFamily: "var(--font-body)" }}>
          Atlas Confidence B
        </div>
      </div>
      {/* Net advantage line */}
      {delta !== 0 && (
        <div style={{ gridColumn: "1 / -1", textAlign: "center", fontSize: "10px", color: delta > 0 ? "#60a5fa" : "#c084fc", fontFamily: "var(--font-body)", fontWeight: 600, borderTop: "1px solid var(--line-006)", paddingTop: "10px" }}>
          {delta > 0 ? "Strategy A" : "Strategy B"} leads overall by {Math.abs(delta)} points
        </div>
      )}
    </div>
  );
}

function FactorRow({
  factor, scoreA, scoreB, idx,
}: {
  factor: string; scoreA: number; scoreB: number; idx: number;
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 120 + idx * 50);
    return () => clearTimeout(t);
  }, [idx]);

  const delta = scoreA - scoreB;
  const aWins = delta > 0;
  const bWins = delta < 0;
  const colorA = aWins ? "var(--green)" : bWins ? "rgba(255,255,255,0.25)" : "var(--amber)";
  const colorB = bWins ? "#c084fc" : aWins ? "rgba(255,255,255,0.25)" : "var(--amber)";

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 140px 1fr",
      gap: "8px", alignItems: "center",
      padding: "7px 0",
      borderBottom: "1px solid var(--line-004)",
    }}>
      {/* A bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "7px", justifyContent: "flex-end" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: colorA, flexShrink: 0 }}>
          {scoreA}
        </span>
        <div style={{ width: "72px", height: "4px", borderRadius: "2px", background: "var(--surface-006)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: "2px", background: colorA,
            width: animated ? `${scoreA}%` : "0%",
            transition: `width 0.75s cubic-bezier(0.16,1,0.3,1) ${idx * 35}ms`,
            marginLeft: "auto",
          }} />
        </div>
      </div>

      {/* Factor label + delta */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontWeight: 500 }}>
          {factor}
        </div>
        {delta !== 0 && (
          <div style={{
            fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)",
            color: aWins ? "#60a5fa" : "#c084fc",
            marginTop: "2px",
          }}>
            {aWins ? `A +${delta}` : `B +${Math.abs(delta)}`}
          </div>
        )}
      </div>

      {/* B bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <div style={{ width: "72px", height: "4px", borderRadius: "2px", background: "var(--surface-006)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: "2px", background: colorB,
            width: animated ? `${scoreB}%` : "0%",
            transition: `width 0.75s cubic-bezier(0.16,1,0.3,1) ${idx * 35}ms`,
          }} />
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: colorB, flexShrink: 0 }}>
          {scoreB}
        </span>
      </div>
    </div>
  );
}

function buildAdvantages(analysisA: StrategyAnalysis, analysisB: StrategyAnalysis): { forA: string[]; forB: string[] } {
  const forA: string[] = [];
  const forB: string[] = [];

  const aFactors = Object.fromEntries(analysisA.factors.map(f => [f.name, f.score]));
  const bFactors = Object.fromEntries(analysisB.factors.map(f => [f.name, f.score]));

  for (const name of FACTORS) {
    const a = aFactors[name] ?? 0;
    const b = bFactors[name] ?? 0;
    if (a - b >= 12) forA.push(name);
    else if (b - a >= 12) forB.push(name);
  }

  return { forA, forB };
}

export default function StrategyComparePanel({
  cardA, cardB, onClose,
}: {
  cardA: StrategyCard;
  cardB: StrategyCard;
  onClose: () => void;
}) {
  const [analysisA, setAnalysisA] = useState<StrategyAnalysis | null>(null);
  const [analysisB, setAnalysisB] = useState<StrategyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thinkIdx, setThinkIdx] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setThinkIdx(i => (i + 1) % THINKING.length), 1500);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([runAnalysis(cardA), runAnalysis(cardB)])
      .then(([a, b]) => { setAnalysisA(a); setAnalysisB(b); })
      .catch(e => setError(e instanceof Error ? e.message : "Comparison failed."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardA.id, cardB.id]);

  const advantages = analysisA && analysisB ? buildAdvantages(analysisA, analysisB) : null;

  // Map factor name → scores for ordered rendering
  const factorRowData = FACTORS.map(name => ({
    name,
    scoreA: analysisA?.factors.find(f => f.name === name)?.score ?? 0,
    scoreB: analysisB?.factors.find(f => f.name === name)?.score ?? 0,
  }));

  return (
    <div style={{
      borderRadius: "14px",
      border: `1px solid ${FV.border}`,
      background: "var(--card-bg)",
      overflow: "hidden",
      marginTop: "4px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        background: FV.bg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: FV.accent, boxShadow: `0 0 6px ${FV.accent}` }} />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: FV.accent, fontFamily: "var(--font-body)" }}>
            Atlas Strategy Comparison
          </span>
        </div>
        <button type="button" onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: "2px 4px" }}>
          ×
        </button>
      </div>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Strategy headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <StrategyHeader card={cardA} label="A" />
          <StrategyHeader card={cardB} label="B" />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "20px 0" }}>
            <style>{`@keyframes cmpPulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: FV.accent, animation: "cmpPulse 1.2s ease-in-out infinite" }} />
            <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontStyle: "italic" }}>
              {THINKING[thinkIdx]}
            </span>
          </div>
        )}

        {error && (
          <p style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{error}</p>
        )}

        {analysisA && analysisB && !loading && (
          <>
            {/* Confidence vs */}
            <ConfidenceVs scoreA={analysisA.finn_confidence} scoreB={analysisB.finn_confidence} />

            {/* Factor table */}
            <div>
              <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 8px", fontFamily: "var(--font-body)" }}>
                Factor Comparison
              </p>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr", gap: "8px", marginBottom: "4px" }}>
                <div style={{ textAlign: "right", fontSize: "10px", fontWeight: 700, color: "#60a5fa", fontFamily: "var(--font-body)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Strategy A</div>
                <div />
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#c084fc", fontFamily: "var(--font-body)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Strategy B</div>
              </div>
              <div>
                {factorRowData.map((f, i) => (
                  <FactorRow key={f.name} factor={f.name} scoreA={f.scoreA} scoreB={f.scoreB} idx={i} />
                ))}
              </div>
            </div>

            {/* Advantage summaries */}
            {advantages && (advantages.forA.length > 0 || advantages.forB.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.14)", borderRadius: "10px", padding: "12px 14px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#60a5fa", margin: "0 0 7px", fontFamily: "var(--font-body)" }}>
                    A&apos;s Strengths
                  </p>
                  {advantages.forA.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {advantages.forA.map(s => (
                        <div key={s} style={{ display: "flex", gap: "5px", alignItems: "flex-start" }}>
                          <span style={{ color: "#60a5fa", fontSize: "10px", flexShrink: 0 }}>↑</span>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>No dominant advantages vs B</p>
                  )}
                </div>
                <div style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.14)", borderRadius: "10px", padding: "12px 14px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#c084fc", margin: "0 0 7px", fontFamily: "var(--font-body)" }}>
                    B&apos;s Strengths
                  </p>
                  {advantages.forB.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {advantages.forB.map(s => (
                        <div key={s} style={{ display: "flex", gap: "5px", alignItems: "flex-start" }}>
                          <span style={{ color: "#c084fc", fontSize: "10px", flexShrink: 0 }}>↑</span>
                          <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>{s}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-body)", margin: 0 }}>No dominant advantages vs A</p>
                  )}
                </div>
              </div>
            )}

            {/* Theses */}
            {(analysisA.thesis || analysisB.thesis) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { thesis: analysisA.thesis, accent: "#60a5fa", bg: "rgba(37,99,235,0.05)", border: "rgba(37,99,235,0.14)", label: "A — Why This Exists" },
                  { thesis: analysisB.thesis, accent: "#c084fc", bg: "rgba(168,85,247,0.05)", border: "rgba(168,85,247,0.14)", label: "B — Why This Exists" },
                ].map(({ thesis, accent, bg, border, label }) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: "10px", padding: "12px 14px" }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: accent, margin: "0 0 7px", fontFamily: "var(--font-body)" }}>
                      {label}
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0, fontFamily: "var(--font-body)" }}>
                      {thesis}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Close */}
            <button type="button" onClick={onClose}
              style={{
                alignSelf: "flex-start", padding: "6px 16px",
                borderRadius: "var(--radius-xl)", border: "1px solid var(--line-008)",
                background: "transparent", color: "var(--text-tertiary)",
                fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer",
              }}>
              Close comparison
            </button>
          </>
        )}
      </div>
    </div>
  );
}
