"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { StrategyCard } from "./types";
import { updateStrategy, duplicateStrategy, deleteStrategy, archiveStrategy, unarchiveStrategy } from "./actions";
import { saveFinnScore } from "./finn-profile-actions";
import StrategyPublicToggle from "./strategy-public-toggle";
import type { StrategyAnalysis } from "@/app/api/strategies/analyze/route";
import type { ImprovementResult } from "@/app/api/strategies/improve/route";

const STRATEGY_STYLES = ["Growth","Value","Blend","Dividend / Income","Quality","Index / Passive","Sector / Thematic","Momentum","Swing","Mean Reversion","Defensive","Balanced","Speculative","Options / Derivatives","Custom"];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFERENCES = ["Low", "Moderate", "High"];
const HOLDING_PERIOD_BIASES = ["Short-term","Swing","Medium-term","Long-term","Very Long-term","Flexible"];

const inp = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const sel = "w-full rounded-xl border border-white/10 bg-(--bg-base) px-3 py-2 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const lbl = "mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500";

// ── Helpers ──────────────────────────────────────────────────────────────────

function riskStyle(value: string | null) {
  const map: Record<string, string> = { low: "Conservative", moderate: "Moderate", high: "Aggressive", conservative: "Conservative", aggressive: "Aggressive" };
  const level = map[value?.toLowerCase() ?? ""] ?? value ?? "Moderate";
  if (level === "Conservative") return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)", label: "Conservative" };
  if (level === "Aggressive") return { bg: "var(--red-bg)", border: "var(--red-border)", color: "var(--red)", label: "Aggressive" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)", label: "Moderate" };
}

function deriveChips(v: StrategyCard["latest_version"]): string[] {
  if (!v) return [];
  const chips: string[] = [];
  if (v.turnover_preference === "Low") chips.push("Low trading");
  else if (v.turnover_preference === "High") chips.push("Active trading");
  if (v.holding_period_bias === "Long-term" || v.holding_period_bias === "Very Long-term") chips.push("Buy & hold");
  else if (v.holding_period_bias === "Short-term" || v.holding_period_bias === "Swing") chips.push("Short-term");
  if (v.cash_min_pct !== null && v.cash_min_pct >= 10) chips.push("Cash buffer");
  if (v.max_position_pct !== null && v.max_position_pct <= 10) chips.push("Diversified");
  else if (v.max_position_pct !== null && v.max_position_pct >= 25) chips.push("Concentrated");
  return chips;
}

// Derives a single prominent health label for the strategy's posture
function deriveHealthLabel(v: StrategyCard["latest_version"], risk: string | null): { label: string; color: string; bg: string; border: string } | null {
  if (!v) return null;
  if (v.max_position_pct !== null && v.max_position_pct >= 25)
    return { label: "Concentrated", color: "var(--amber)", bg: "var(--amber-bg)", border: "var(--amber-border)" };
  if (v.cash_min_pct !== null && v.cash_min_pct >= 15)
    return { label: "Cash heavy", color: "var(--amber)", bg: "var(--amber-bg)", border: "var(--amber-border)" };
  const r = risk?.toLowerCase();
  if (r === "aggressive")
    return { label: "Aggressive", color: "var(--red)", bg: "var(--red-bg)", border: "var(--red-border)" };
  if (v.turnover_preference === "Low" && (v.holding_period_bias === "Long-term" || v.holding_period_bias === "Very Long-term"))
    return { label: "Low turnover", color: "var(--green)", bg: "var(--green-bg)", border: "var(--green-border)" };
  if (v.holding_period_bias === "Very Long-term" || v.holding_period_bias === "Long-term")
    return { label: "Long-term", color: "rgba(96,165,250,0.85)", bg: "rgba(37,99,235,0.08)", border: "rgba(37,99,235,0.2)" };
  return null;
}

function regimeFitBadge(
  style: string | null,
  riskLevel: string | null,
  regimeLevel: string | null,
): { label: string; color: string; bg: string; border: string } | null {
  if (!regimeLevel) return null;
  const risk = riskLevel?.toLowerCase() ?? "moderate";
  const s = (style ?? "").toLowerCase();

  if (regimeLevel === "risk-off" || regimeLevel === "defensive") {
    if (risk === "aggressive" || s.includes("speculative") || s.includes("momentum")) {
      return { label: "Regime caution", color: "var(--red)", bg: "var(--red-bg)", border: "var(--red-border)" };
    }
    if (s.includes("defensive") || s.includes("dividend") || s.includes("income") || risk === "conservative") {
      return { label: "Regime suited", color: "var(--green)", bg: "var(--green-bg)", border: "var(--green-border)" };
    }
    return { label: "Regime neutral", color: "var(--amber)", bg: "var(--amber-bg)", border: "var(--amber-border)" };
  }

  if (regimeLevel === "risk-on") {
    if (risk === "aggressive" || s.includes("growth") || s.includes("momentum")) {
      return { label: "Regime suited", color: "var(--green)", bg: "var(--green-bg)", border: "var(--green-border)" };
    }
    if (s.includes("defensive") && risk === "conservative") {
      return { label: "Regime neutral", color: "var(--amber)", bg: "var(--amber-bg)", border: "var(--amber-border)" };
    }
  }

  return null;
}

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── Atlas Intelligence Panel ───────────────────────────────────────────────────

const FV = {
  bg:     "rgba(109,40,217,0.06)",
  border: "rgba(109,40,217,0.18)",
  accent: "#7c3aed",
  dim:    "rgba(124,58,237,0.5)",
} as const;

function scoreColor(s: number) {
  if (s >= 80) return "var(--green)";
  if (s >= 60) return "var(--amber)";
  return "var(--red)";
}
function scoreBarBg(s: number) {
  if (s >= 80) return "var(--green)";
  if (s >= 60) return "var(--amber)";
  return "var(--red)";
}

function ConfidenceRing({ score }: { score: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 80); return () => clearTimeout(t); }, []);
  const offset = animated ? circ - (score / 100) * circ : circ;
  const color = scoreColor(score);
  return (
    <div style={{ position: "relative", width: "72px", height: "72px", flexShrink: 0 }}>
      <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color, lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: "8px", color: "var(--text-muted)", fontFamily: "var(--font-body)", letterSpacing: "0.04em", marginTop: "1px" }}>/ 100</span>
      </div>
    </div>
  );
}

function FactorBar({ factor, idx }: { factor: StrategyAnalysis["factors"][0]; idx: number }) {
  const [animated, setAnimated] = useState(false);
  const [tooltip, setTooltip] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 120 + idx * 55); return () => clearTimeout(t); }, [idx]);
  const color = scoreBarBg(factor.score);
  return (
    <div style={{ position: "relative" }}
      onMouseEnter={() => setTooltip(true)} onMouseLeave={() => setTooltip(false)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontWeight: 500 }}>{factor.name}</span>
        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, color }}>{factor.score}</span>
      </div>
      <div style={{ height: "4px", borderRadius: "2px", background: "var(--surface-006)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: "2px", background: color,
          width: animated ? `${factor.score}%` : "0%",
          transition: `width 0.75s cubic-bezier(0.16,1,0.3,1) ${idx * 40}ms`,
        }} />
      </div>
      {tooltip && factor.explanation && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0,
          background: "var(--card-bg)", border: "1px solid var(--card-border)",
          borderRadius: "var(--radius-md)", padding: "7px 10px",
          fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)",
          lineHeight: 1.5, zIndex: 10, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        }}>
          {factor.explanation}
        </div>
      )}
    </div>
  );
}

function FinnIntelligencePanel({ card, onAnalysis }: { card: StrategyCard; onAnalysis?: (a: StrategyAnalysis) => void }) {
  const [analysis, setAnalysis] = useState<StrategyAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const fetchedRef = useRef(false);

  async function fetchAnalysis() {
    if (fetchedRef.current) { setOpen(true); return; }
    setLoading(true);
    setError(null);
    setOpen(true);
    const v = card.latest_version;
    try {
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
      if (!res.ok || data.error) { setError(data.error ?? "Analysis failed."); return; }
      const a = data.analysis ?? null;
      setAnalysis(a);
      if (a) {
        onAnalysis?.(a);
        saveFinnScore(card.id, a.finn_confidence).catch(() => {});
      }
      fetchedRef.current = true;
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  const THINKING = ["Evaluating strategy parameters…", "Analyzing risk profile…", "Calibrating factor scores…", "Building investment thesis…", "Identifying failure conditions…"];
  const [thinkIdx, setThinkIdx] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setThinkIdx((i) => (i + 1) % THINKING.length), 1400);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
      {/* Trigger button */}
      {!open && (
        <button type="button" onClick={fetchAnalysis}
          style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "7px 14px", borderRadius: "var(--radius-xl)",
            border: `1px solid ${FV.border}`, background: FV.bg,
            color: FV.accent, fontFamily: "var(--font-body)",
            fontSize: "12px", fontWeight: 600, cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(109,40,217,0.1)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = FV.bg; }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke={FV.accent} strokeWidth="1.5" />
            <path d="M7 9c0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.5-1 2.5-2.5 3V13.5" stroke={FV.accent} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="15.5" r="0.75" fill={FV.accent} />
          </svg>
          Atlas Analysis
        </button>
      )}

      {/* Panel content */}
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Header bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: FV.accent, boxShadow: `0 0 6px ${FV.dim}` }} />
              <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: FV.accent, fontFamily: "var(--font-body)" }}>Atlas Analysis</span>
            </div>
            <button type="button" onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "15px", lineHeight: 1, padding: "2px" }}>
              ×
            </button>
          </div>

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 0" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: FV.accent, animation: "finnPulse 1.2s ease-in-out infinite" }} />
              <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontStyle: "italic" }}>
                {THINKING[thinkIdx]}
              </span>
              <style>{`@keyframes finnPulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
            </div>
          )}

          {error && !loading && (
            <p style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{error}</p>
          )}

          {analysis && !loading && (
            <>
              {/* Confidence ring + factor grid */}
              <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
                  <ConfidenceRing score={analysis.finn_confidence} />
                  <span style={{ fontSize: "9px", color: "var(--text-muted)", fontFamily: "var(--font-body)", textAlign: "center", letterSpacing: "0.04em", textTransform: "uppercase" }}>Atlas Confidence</span>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "7px" }}>
                  {analysis.factors.map((f, i) => <FactorBar key={f.name} factor={f} idx={i} />)}
                </div>
              </div>

              {/* Strategy Thesis */}
              <div style={{ background: FV.bg, border: `1px solid ${FV.border}`, borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: FV.accent, margin: "0 0 7px", fontFamily: "var(--font-body)" }}>
                  Why This Strategy Exists
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7, margin: 0, fontFamily: "var(--font-body)" }}>
                  {analysis.thesis}
                </p>
              </div>

              {/* Weaknesses */}
              <div>
                <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--amber)", margin: "0 0 8px", fontFamily: "var(--font-body)" }}>
                  Weaknesses
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {analysis.weaknesses.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <span style={{ color: "var(--amber)", fontSize: "11px", flexShrink: 0, marginTop: "1px" }}>▲</span>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0, fontFamily: "var(--font-body)" }}>{w}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Failure Conditions */}
              <div style={{ paddingBottom: "4px" }}>
                <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)", margin: "0 0 8px", fontFamily: "var(--font-body)" }}>
                  What Would Break This Strategy
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  {analysis.failure_conditions.map((fc, i) => (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <span style={{ color: "var(--red)", fontSize: "11px", flexShrink: 0, marginTop: "1px" }}>✕</span>
                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0, fontFamily: "var(--font-body)" }}>{fc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bull vs. Bear */}
              {(analysis.bull_case?.length > 0 || analysis.bear_case?.length > 0) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ background: "rgba(0,211,149,0.05)", border: "1px solid rgba(0,211,149,0.15)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--green)", margin: "0 0 7px", fontFamily: "var(--font-body)" }}>
                      Bull Case
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {(analysis.bull_case ?? []).map((b, i) => (
                        <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                          <span style={{ color: "var(--green)", fontSize: "10px", flexShrink: 0, marginTop: "1px" }}>↑</span>
                          <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, fontFamily: "var(--font-body)" }}>{b}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--red)", margin: "0 0 7px", fontFamily: "var(--font-body)" }}>
                      Bear Case
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {(analysis.bear_case ?? []).map((b, i) => (
                        <div key={i} style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                          <span style={{ color: "var(--red)", fontSize: "10px", flexShrink: 0, marginTop: "1px" }}>↓</span>
                          <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, fontFamily: "var(--font-body)" }}>{b}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Refresh link */}
              <button type="button" onClick={() => { fetchedRef.current = false; setAnalysis(null); fetchAnalysis(); }}
                style={{ alignSelf: "flex-start", fontSize: "10px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-body)", padding: 0 }}>
                Regenerate
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Improve Strategy Panel ────────────────────────────────────────────────────

const IMPROVE_MODES = [
  { id: "Growth",              icon: "↑", label: "Growth"        },
  { id: "Safety",              icon: "⛊", label: "Safety"        },
  { id: "Taxes",               icon: "%", label: "Taxes"         },
  { id: "Income",              icon: "$", label: "Income"        },
  { id: "Downside Protection", icon: "▼", label: "Downside"      },
  { id: "Diversification",     icon: "◈", label: "Diversify"     },
  { id: "Retirement",          icon: "◎", label: "Retirement"    },
  { id: "Simplicity",          icon: "—", label: "Simplicity"    },
] as const;

type ImproveMode = typeof IMPROVE_MODES[number]["id"];

const IMPROVE_THINKING = [
  "Identifying optimization targets…",
  "Modeling parameter changes…",
  "Projecting score deltas…",
  "Evaluating tradeoffs…",
  "Finalizing improvement plan…",
];

function ScoreDeltaRow({ factor, before, after }: { factor: string; before: number; after: number }) {
  const delta = after - before;
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 80); return () => clearTimeout(t); }, []);
  const afterColor = scoreColor(after);
  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <span style={{ fontSize: "10px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", width: "148px", flexShrink: 0 }}>{factor}</span>
      <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: "var(--surface-006)", overflow: "hidden", position: "relative" }}>
        {/* Before bar (ghost) */}
        <div style={{ position: "absolute", height: "100%", borderRadius: "2px", background: "var(--surface-010)", width: `${before}%` }} />
        {/* After bar */}
        <div style={{
          position: "absolute", height: "100%", borderRadius: "2px", background: afterColor,
          width: animated ? `${after}%` : "0%",
          transition: "width 0.75s cubic-bezier(0.16,1,0.3,1)",
        }} />
      </div>
      <span style={{
        fontSize: "10px", fontFamily: "var(--font-mono)", fontWeight: 700, width: "38px", textAlign: "right", flexShrink: 0,
        color: delta > 0 ? "var(--green)" : delta < 0 ? "var(--red)" : "var(--text-muted)",
      }}>
        {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "—"}
      </span>
    </div>
  );
}

function ImproveStrategyPanel({
  card,
  currentFactors,
  currentConfidence,
  onApplied,
}: {
  card: StrategyCard;
  currentFactors: StrategyAnalysis["factors"] | null;
  currentConfidence: number | null;
  onApplied: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<ImproveMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImprovementResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [thinkIdx, setThinkIdx] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setThinkIdx((i) => (i + 1) % IMPROVE_THINKING.length), 1300);
    return () => clearInterval(t);
  }, [loading]);

  async function runImprovement(mode: ImproveMode) {
    setActiveMode(mode);
    setLoading(true);
    setError(null);
    setResult(null);
    setApplied(false);
    const v = card.latest_version;
    try {
      const res = await fetch("/api/strategies/improve", {
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
          current_factors: currentFactors ?? [],
          current_confidence: currentConfidence ?? 0,
          mode,
        }),
      });
      const data = await res.json() as { result?: ImprovementResult; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? "Improvement failed."); return; }
      setResult(data.result ?? null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function applyChanges() {
    if (!result?.improved_params) return;
    setApplying(true);
    try {
      const v = card.latest_version;
      const p = result.improved_params;
      const fd = new FormData();
      fd.set("strategy_id", card.id);
      fd.set("name", card.name);
      fd.set("description", card.description ?? "");
      fd.set("style", card.style ?? "Growth");
      fd.set("risk_level", card.risk_level ?? "Moderate");
      fd.set("turnover_preference", p.turnover_preference ?? v?.turnover_preference ?? "Moderate");
      fd.set("holding_period_bias", p.holding_period_bias ?? v?.holding_period_bias ?? "Long-term");
      fd.set("max_position_pct", String(p.max_position_pct ?? v?.max_position_pct ?? ""));
      fd.set("min_position_pct", String(p.min_position_pct ?? v?.min_position_pct ?? ""));
      fd.set("cash_min_pct", String(p.cash_min_pct ?? v?.cash_min_pct ?? ""));
      fd.set("cash_max_pct", String(p.cash_max_pct ?? v?.cash_max_pct ?? ""));
      fd.set("prompt_text", p.prompt_text ?? v?.prompt_text ?? "");
      await updateStrategy(fd);
      setApplied(true);
      onApplied();
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  const deltaSummary = result
    ? result.score_deltas.reduce((sum, d) => sum + (d.after - d.before), 0)
    : 0;
  const confDelta = result ? result.projected_confidence - (currentConfidence ?? 0) : 0;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "7px 14px", borderRadius: "var(--radius-xl)",
          border: "1px solid rgba(124,58,237,0.22)", background: "rgba(109,40,217,0.08)",
          color: "#7c3aed", fontFamily: "var(--font-body)",
          fontSize: "12px", fontWeight: 600, cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(109,40,217,0.14)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(109,40,217,0.08)"; }}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4.22 4.22l2.12 2.12M9.66 9.66l2.12 2.12M4.22 11.78l2.12-2.12M9.66 6.34l2.12-2.12" stroke="#7c3aed" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        Improve Strategy
      </button>
    );
  }

  return (
    <div style={{ background: "rgba(109,40,217,0.04)", border: "1px solid rgba(109,40,217,0.15)", borderRadius: "var(--radius-lg)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "14px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7c3aed", boxShadow: "0 0 6px rgba(124,58,237,0.5)" }} />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#7c3aed", fontFamily: "var(--font-body)" }}>Improve Strategy</span>
        </div>
        <button type="button" onClick={() => { setOpen(false); setResult(null); setActiveMode(null); }}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "15px", lineHeight: 1, padding: "2px" }}>
          ×
        </button>
      </div>

      {/* Mode chips */}
      <div>
        <p style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", margin: "0 0 8px", letterSpacing: "0.02em" }}>
          Optimize for:
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {IMPROVE_MODES.map(({ id, icon, label }) => {
            const isActive = activeMode === id;
            return (
              <button key={id} type="button"
                onClick={() => runImprovement(id as ImproveMode)}
                disabled={loading}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "5px 11px", borderRadius: "var(--radius-xl)",
                  border: isActive ? "1px solid rgba(124,58,237,0.4)" : "1px solid rgba(255,255,255,0.08)",
                  background: isActive ? "rgba(109,40,217,0.15)" : "rgba(255,255,255,0.03)",
                  color: isActive ? "#7c3aed" : "var(--text-secondary)",
                  fontFamily: "var(--font-body)", fontSize: "11px", fontWeight: isActive ? 700 : 400,
                  cursor: loading ? "default" : "pointer", opacity: loading && !isActive ? 0.5 : 1,
                  transition: "background 0.12s, border-color 0.12s, color 0.12s",
                }}>
                <span style={{ fontSize: "10px", opacity: 0.8 }}>{icon}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Thinking state */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#7c3aed", animation: "finnPulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontStyle: "italic" }}>
            {IMPROVE_THINKING[thinkIdx]}
          </span>
        </div>
      )}

      {error && !loading && (
        <p style={{ fontSize: "12px", color: "var(--red)", fontFamily: "var(--font-body)", margin: 0 }}>{error}</p>
      )}

      {result && !loading && (
        <>
          {/* Confidence delta badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "var(--surface-003)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
            <div>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-body)", marginBottom: "3px" }}>Atlas Confidence</div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", color: "var(--text-muted)", fontWeight: 500 }}>{currentConfidence ?? "—"}</span>
                <svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M1 5h14M10 1l4 4-4 4" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, color: confDelta >= 0 ? "var(--green)" : "var(--red)" }}>
                  {result.projected_confidence}
                </span>
                <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 600, color: confDelta > 0 ? "var(--green)" : confDelta < 0 ? "var(--red)" : "var(--text-muted)" }}>
                  {confDelta > 0 ? `+${confDelta}` : confDelta}
                </span>
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-body)", marginBottom: "3px" }}>Net factor Δ</div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: deltaSummary > 0 ? "var(--green)" : deltaSummary < 0 ? "var(--red)" : "var(--text-muted)" }}>
                {deltaSummary > 0 ? `+${deltaSummary}` : deltaSummary}
              </span>
            </div>
          </div>

          {/* Parameter changes */}
          {result.changes.length > 0 && (
            <div>
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7c3aed", margin: "0 0 8px", fontFamily: "var(--font-body)" }}>
                Parameter Changes
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--line-006)" }}>
                {result.changes.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "6px", alignItems: "start", padding: "8px 10px", background: "var(--surface-002)", borderBottom: i < result.changes.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                    <div>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px", fontFamily: "var(--font-body)" }}>{c.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.4 }}>{c.reason}</div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, paddingTop: "1px" }}>
                      <div style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", textDecoration: "line-through", marginBottom: "2px" }}>{c.from}</div>
                      <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#7c3aed" }}>{c.to}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score deltas */}
          <div>
            <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", margin: "0 0 10px", fontFamily: "var(--font-body)" }}>
              Factor Impact
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {result.score_deltas.map((d) => (
                <ScoreDeltaRow key={d.factor} factor={d.factor} before={d.before} after={d.after} />
              ))}
            </div>
          </div>

          {/* Narrative */}
          <div style={{ background: "rgba(109,40,217,0.06)", border: "1px solid rgba(109,40,217,0.16)", borderRadius: "var(--radius-md)", padding: "10px 13px" }}>
            <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#7c3aed", margin: "0 0 6px", fontFamily: "var(--font-body)" }}>
              Atlas Rationale
            </p>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0, fontFamily: "var(--font-body)" }}>
              {result.narrative}
            </p>
          </div>

          {/* Tradeoffs */}
          {result.tradeoffs.length > 0 && (
            <div>
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--amber)", margin: "0 0 7px", fontFamily: "var(--font-body)" }}>
                Tradeoffs
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {result.tradeoffs.map((t, i) => (
                  <div key={i} style={{ display: "flex", gap: "7px", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--amber)", fontSize: "11px", flexShrink: 0, marginTop: "1px" }}>↔</span>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0, fontFamily: "var(--font-body)" }}>{t}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apply / Discard */}
          {applied ? (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--green)", fontFamily: "var(--font-body)", fontWeight: 600 }}>✓ Changes applied</span>
              <button type="button" onClick={() => { setResult(null); setActiveMode(null); setApplied(false); }}
                style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "var(--font-body)", padding: 0, marginLeft: "4px" }}>
                Try another
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={applyChanges} disabled={applying}
                style={{ padding: "7px 18px", borderRadius: "var(--radius-xl)", border: "none", background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "#fff", fontFamily: "var(--font-body)", fontSize: "12px", fontWeight: 700, cursor: applying ? "default" : "pointer", opacity: applying ? 0.7 : 1 }}>
                {applying ? "Applying…" : "Apply Changes"}
              </button>
              <button type="button" onClick={() => { setResult(null); setActiveMode(null); }}
                style={{ padding: "7px 13px", borderRadius: "var(--radius-xl)", border: "1px solid var(--line-008)", background: "transparent", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", fontSize: "12px", cursor: "pointer" }}>
                Discard
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type CardMode = "collapsed" | "expanded" | "editing";

// ── Component ────────────────────────────────────────────────────────────────

export default function StrategyCardItem({
  card,
  isNew,
  isArchived = false,
  regimeLevel = null,
}: {
  card: StrategyCard;
  isNew?: boolean;
  isArchived?: boolean;
  regimeLevel?: string | null;
}) {
  const router = useRouter();
  const rs = riskStyle(card.risk_level);
  const chips = deriveChips(card.latest_version);
  const health = deriveHealthLabel(card.latest_version, card.risk_level);
  const regimeFit = regimeFitBadge(card.style, card.risk_level, regimeLevel);
  const [mode, setMode] = useState<CardMode>("collapsed");
  const [isEditPending, startEdit] = useTransition();
  const [isDupPending, startDup] = useTransition();
  const [isDeletePending, startDelete] = useTransition();
  const [isArchivePending, startArchive] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editError, setEditError] = useState("");
  const [showParams, setShowParams] = useState(false);
  const [sharedAnalysis, setSharedAnalysis] = useState<StrategyAnalysis | null>(null);

  const v = card.latest_version;
  const [editForm, setEditForm] = useState({
    name: card.name,
    description: card.description ?? "",
    style: card.style ?? "Growth",
    risk_level: card.risk_level ?? "Moderate",
    prompt_text: v?.prompt_text ?? "",
    max_position_pct: v?.max_position_pct?.toString() ?? "",
    min_position_pct: v?.min_position_pct?.toString() ?? "",
    turnover_preference: v?.turnover_preference ?? "Moderate",
    holding_period_bias: v?.holding_period_bias ?? "Long-term",
    cash_min_pct: v?.cash_min_pct?.toString() ?? "",
    cash_max_pct: v?.cash_max_pct?.toString() ?? "",
  });

  function handleEditSubmit() {
    setEditError("");
    startEdit(async () => {
      try {
        const fd = new FormData();
        fd.set("strategy_id", card.id);
        Object.entries(editForm).forEach(([k, val]) => fd.set(k, val));
        await updateStrategy(fd);
        router.refresh();
        setMode("expanded");
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  }

  function handleHeaderToggle() {
    if (mode === "editing") return;
    setMode(mode === "collapsed" ? "expanded" : "collapsed");
  }

  const isDetailOpen = mode !== "collapsed";

  return (
    <>
      <style>{`
        @keyframes newCardGlow {
          0%   { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
          25%  { box-shadow: 0 0 0 3px rgba(37,99,235,0.25), 0 0 20px rgba(37,99,235,0.12); }
          100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
        }
      `}</style>
      <div
        className="bt-card"
        style={{
          overflow: "hidden",
          opacity: isArchived ? 0.7 : 1,
          animation: isNew ? "newCardGlow 1.4s cubic-bezier(0.16,1,0.3,1) forwards" : undefined,
        }}
      >
        {/* ── Header row — click to expand/collapse ── */}
        <button
          type="button"
          onClick={handleHeaderToggle}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "11px 16px 9px", background: "transparent", border: "none", cursor: mode === "editing" ? "default" : "pointer", textAlign: "left" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "5px" }}>
              <span style={{ fontSize: "14px", fontWeight: 600, color: isArchived ? "var(--text-secondary)" : "var(--text-primary)", fontFamily: "var(--font-display)", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}>
                {card.name}
              </span>
              {isArchived ? (
                <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 7px", borderRadius: "var(--radius-full)", background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-muted)" }}>
                  Archived
                </span>
              ) : (
                <>
                  <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 7px", borderRadius: "var(--radius-full)", background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color }}>
                    {rs.label}
                  </span>
                  {card.style && (
                    <span style={{ fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                      {card.style}
                    </span>
                  )}
                  {health && (
                    <span style={{ fontSize: "9px", fontWeight: 600, padding: "2px 7px", borderRadius: "var(--radius-full)", background: health.bg, border: `1px solid ${health.border}`, color: health.color }}>
                      {health.label}
                    </span>
                  )}
                  {regimeFit && (
                    <span style={{ fontSize: "9px", fontWeight: 600, padding: "2px 7px", borderRadius: "var(--radius-full)", background: regimeFit.bg, border: `1px solid ${regimeFit.border}`, color: regimeFit.color }}>
                      {regimeFit.label}
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"
            style={{ color: "var(--text-muted)", flexShrink: 0, transform: isDetailOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.28s cubic-bezier(0.16,1,0.3,1)" }}>
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </button>

        {/* ── Always-visible info row (description + chips + actions) ── */}
        {!isArchived && (
          <div style={{ padding: "0 16px 12px", borderBottom: isDetailOpen ? "1px solid var(--border-subtle)" : "none" }}>
            {/* Description — 1 line */}
            {card.description && (
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 7px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical" as const }}>
                {card.description}
              </p>
            )}

            {/* Chips */}
            {chips.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                {chips.map((chip) => (
                  <span key={chip} style={{ fontSize: "9px", color: "var(--text-muted)", background: "var(--surface-004)", border: "1px solid var(--line-006)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                    {chip}
                  </span>
                ))}
              </div>
            )}

            {/* Actions row */}
            <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => { setMode("editing"); }}
                style={{ padding: "5px 11px", borderRadius: "var(--radius-xl)", fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", transition: "border-color 0.15s, color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
                Edit
              </button>
              <button
                type="button"
                onClick={() => startDup(async () => { await duplicateStrategy(card.id); router.refresh(); })}
                disabled={isDupPending}
                style={{ padding: "5px 11px", borderRadius: "var(--radius-xl)", fontSize: "11px", fontWeight: 500, color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", opacity: isDupPending ? 0.5 : 1, transition: "border-color 0.15s, color 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)"; }}
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                  <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                </svg>
                {isDupPending ? "Copying..." : "Duplicate"}
              </button>

              {/* Right side: last updated + public toggle */}
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {formatRelativeDate(card.updated_at)}
                </span>
                <StrategyPublicToggle strategyId={card.id} isPublic={card.is_public ?? false} />
              </div>
            </div>
          </div>
        )}

        {/* ── Expandable detail area ── */}
        <div style={{ display: "grid", gridTemplateRows: isDetailOpen ? "1fr" : "0fr", transition: "grid-template-rows 0.32s cubic-bezier(0.16,1,0.3,1)" }}>
          <div style={{ overflow: "hidden" }}>

            {/* ── ARCHIVED state ── */}
            {isArchived ? (
              <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {card.description && (
                  <p style={{ fontSize: "13px", color: "var(--text-tertiary)", lineHeight: 1.6 }}>{card.description}</p>
                )}
                {v && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "5px" }}>
                    {[
                      ["Max holding", v.max_position_pct !== null ? `${v.max_position_pct}%` : "—"],
                      ["Trading freq", v.turnover_preference ?? "—"],
                      ["Time horizon", v.holding_period_bias ?? "—"],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "7px 10px" }}>
                        <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>{label}</div>
                        <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    disabled={isArchivePending}
                    onClick={() => startArchive(async () => { await unarchiveStrategy(card.id); router.refresh(); })}
                    style={{ padding: "6px 14px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", cursor: "pointer", opacity: isArchivePending ? 0.6 : 1, display: "flex", alignItems: "center", gap: "5px" }}
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd" />
                    </svg>
                    {isArchivePending ? "Restoring..." : "Restore"}
                  </button>
                  {confirmDelete ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginLeft: "auto" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Delete permanently?</span>
                      <button type="button" onClick={() => startDelete(async () => { await deleteStrategy(card.id); router.refresh(); })} disabled={isDeletePending}
                        style={{ padding: "4px 10px", borderRadius: "var(--radius-xl)", fontSize: "11px", fontWeight: 600, color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", cursor: "pointer" }}>
                        {isDeletePending ? "Deleting..." : "Delete"}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)}
                        style={{ padding: "4px 10px", borderRadius: "var(--radius-xl)", fontSize: "11px", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)}
                      style={{ padding: "5px 12px", borderRadius: "var(--radius-xl)", fontSize: "12px", color: "var(--text-muted)", background: "transparent", border: "1px solid transparent", cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px" }}
                      className="hover:border-red-500/20 hover:text-red-400 transition-colors"
                    >
                      <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" /></svg>
                      Delete permanently
                    </button>
                  )}
                </div>
              </div>

            ) : mode === "editing" ? (
              /* ── Edit form ── */
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--brand-blue)" }}>Edit Strategy</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className={lbl}>Name</label>
                    <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Style</label>
                    <select value={editForm.style} onChange={e => setEditForm(p => ({ ...p, style: e.target.value }))} className={sel}>
                      {STRATEGY_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Risk level</label>
                    <select value={editForm.risk_level} onChange={e => setEditForm(p => ({ ...p, risk_level: e.target.value }))} className={sel}>
                      {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Trading frequency</label>
                    <select value={editForm.turnover_preference} onChange={e => setEditForm(p => ({ ...p, turnover_preference: e.target.value }))} className={sel}>
                      {TURNOVER_PREFERENCES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Time horizon</label>
                    <select value={editForm.holding_period_bias} onChange={e => setEditForm(p => ({ ...p, holding_period_bias: e.target.value }))} className={sel}>
                      {HOLDING_PERIOD_BIASES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Max single holding %</label>
                    <input type="number" value={editForm.max_position_pct} onChange={e => setEditForm(p => ({ ...p, max_position_pct: e.target.value }))} className={inp} placeholder="15" />
                  </div>
                  <div>
                    <label className={lbl}>Min single holding %</label>
                    <input type="number" value={editForm.min_position_pct} onChange={e => setEditForm(p => ({ ...p, min_position_pct: e.target.value }))} className={inp} placeholder="2" />
                  </div>
                  <div>
                    <label className={lbl}>Keep in cash (min) %</label>
                    <input type="number" value={editForm.cash_min_pct} onChange={e => setEditForm(p => ({ ...p, cash_min_pct: e.target.value }))} className={inp} placeholder="5" />
                  </div>
                  <div>
                    <label className={lbl}>Keep in cash (max) %</label>
                    <input type="number" value={editForm.cash_max_pct} onChange={e => setEditForm(p => ({ ...p, cash_max_pct: e.target.value }))} className={inp} placeholder="20" />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className={lbl}>Description</label>
                    <textarea value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} className={`${inp} min-h-[60px]`} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className={lbl}>AI instructions</label>
                    <textarea value={editForm.prompt_text} onChange={e => setEditForm(p => ({ ...p, prompt_text: e.target.value }))} className={`${inp} min-h-[80px]`} />
                  </div>
                </div>
                {editError && (
                  <div style={{ fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>{editError}</div>
                )}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button type="button" onClick={handleEditSubmit} disabled={isEditPending}
                    style={{ padding: "7px 16px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", opacity: isEditPending ? 0.6 : 1, border: "none", cursor: "pointer" }}>
                    {isEditPending ? "Saving..." : "Save changes"}
                  </button>
                  <button type="button" onClick={() => setMode("expanded")}
                    style={{ padding: "7px 14px", borderRadius: "var(--radius-xl)", fontSize: "12px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>

            ) : (
              /* ── Expanded detail view ── */
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>

                {/* Full description (if not shown in collapsed, or overflow) */}
                {card.description && (
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>{card.description}</p>
                )}

                {/* Parameters — collapsible "View details" */}
                {v && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowParams(p => !p)}
                      style={{ display: "flex", alignItems: "center", gap: "5px", padding: "0", background: "none", border: "none", cursor: "pointer", marginBottom: showParams ? "8px" : "0" }}
                    >
                      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: showParams ? "var(--brand-blue)" : "var(--text-muted)" }}>
                        {showParams ? "Hide parameters" : "View parameters"}
                      </span>
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"
                        style={{ color: showParams ? "var(--brand-blue)" : "var(--text-muted)", transform: showParams ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s cubic-bezier(0.16,1,0.3,1)" }}>
                        <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <div style={{ display: "grid", gridTemplateRows: showParams ? "1fr" : "0fr", transition: "grid-template-rows 0.24s cubic-bezier(0.16,1,0.3,1)" }}>
                      <div style={{ overflow: "hidden" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "5px" }}>
                          {[
                            ["Max single holding", v.max_position_pct !== null ? `${v.max_position_pct}%` : "—"],
                            ["Min single holding", v.min_position_pct !== null ? `${v.min_position_pct}%` : "—"],
                            ["Cash range", v.cash_min_pct !== null && v.cash_max_pct !== null ? `${v.cash_min_pct}–${v.cash_max_pct}%` : "—"],
                            ["Trading frequency", v.turnover_preference ?? "—"],
                            ["Time horizon", v.holding_period_bias ?? "—"],
                            ["Version", `v${v.version_number}`],
                          ].map(([label, value]) => (
                            <div key={String(label)} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "7px 10px" }}>
                              <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{label}</div>
                              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI instructions */}
                {v?.prompt_text && (
                  <div style={{ background: "rgba(37,99,235,0.05)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: "var(--radius-md)", padding: "10px 14px" }}>
                    <p style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(96,165,250,0.8)", marginBottom: "5px" }}>AI instructions</p>
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{v.prompt_text}</p>
                  </div>
                )}

                {/* Atlas Intelligence + Improve */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <FinnIntelligencePanel card={card} onAnalysis={setSharedAnalysis} />
                  <ImproveStrategyPanel
                    card={card}
                    currentFactors={sharedAnalysis?.factors ?? null}
                    currentConfidence={sharedAnalysis?.finn_confidence ?? null}
                    onApplied={() => setSharedAnalysis(null)}
                  />
                </div>

                {/* Destructive / archive actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingTop: "2px", borderTop: "1px solid var(--border-subtle)" }}>
                  <button
                    type="button"
                    onClick={() => startArchive(async () => { await archiveStrategy(card.id); router.refresh(); })}
                    disabled={isArchivePending}
                    style={{ padding: "5px 11px", borderRadius: "var(--radius-xl)", fontSize: "11px", color: "var(--text-tertiary)", background: "transparent", border: "1px solid transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", opacity: isArchivePending ? 0.5 : 1, transition: "border-color 0.15s, color 0.15s" }}
                    className="hover:border-white/10 hover:text-slate-300 transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 3a1 1 0 00-1 1v1a1 1 0 001 1h16a1 1 0 001-1V4a1 1 0 00-1-1H2z" />
                      <path fillRule="evenodd" d="M2 7.5h16l-.811 7.71a2 2 0 01-1.99 1.79H4.802a2 2 0 01-1.99-1.79L2 7.5zm5.22 1.72a.75.75 0 011.06 0L10 10.94l1.72-1.72a.75.75 0 111.06 1.06L11.06 12l1.72 1.72a.75.75 0 11-1.06 1.06L10 13.06l-1.72 1.72a.75.75 0 01-1.06-1.06L8.94 12l-1.72-1.72a.75.75 0 010-1.06z" clipRule="evenodd" />
                    </svg>
                    {isArchivePending ? "Archiving..." : "Archive"}
                  </button>

                  {confirmDelete ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", marginLeft: "auto" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Delete?</span>
                      <button type="button" onClick={() => startDelete(async () => { await deleteStrategy(card.id); router.refresh(); })} disabled={isDeletePending}
                        style={{ padding: "4px 10px", borderRadius: "var(--radius-xl)", fontSize: "11px", fontWeight: 600, color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", cursor: "pointer" }}>
                        {isDeletePending ? "Deleting..." : "Yes, delete"}
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)}
                        style={{ padding: "4px 10px", borderRadius: "var(--radius-xl)", fontSize: "11px", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)}
                      style={{ padding: "5px 11px", borderRadius: "var(--radius-xl)", fontSize: "11px", color: "var(--text-muted)", background: "transparent", border: "1px solid transparent", cursor: "pointer", marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}
                      className="hover:border-red-500/20 hover:text-red-400 transition-colors"
                    >
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
