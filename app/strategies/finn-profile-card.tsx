"use client";

import type { FinnProfile } from "./finn-profile-actions";
import type { StrategyCard } from "./types";

// ── Memory insight types ──────────────────────────────────────────────────────

export type InsightSignal = "tax" | "volatility" | "time" | "concentration" | "cash" | "style";

export type MemoryInsight = {
  label: string;
  detail: string;
  signal: InsightSignal;
};

// Pure function — importable server-side from page.tsx
export function deriveMemoryInsights(cards: StrategyCard[]): MemoryInsight[] {
  if (cards.length < 2) return [];

  const insights: MemoryInsight[] = [];
  const versions = cards.map(c => c.latest_version).filter(Boolean);
  const n = versions.length;
  if (n === 0) return [];
  const threshold = Math.max(2, Math.ceil(n * 0.55));

  // Tax / turnover pattern
  const lowTurnover = versions.filter(v => v?.turnover_preference === "Low").length;
  if (lowTurnover >= threshold) {
    insights.push({
      label: "Consistently prioritizes low turnover",
      detail: `${lowTurnover} of ${n} strategies use low-turnover positioning — tax deferral appears to be a standing priority.`,
      signal: "tax",
    });
  } else {
    const highTurnover = versions.filter(v => v?.turnover_preference === "High").length;
    if (highTurnover >= threshold) {
      insights.push({
        label: "Active trading preference",
        detail: `${highTurnover} of ${n} strategies favour high turnover — consistent preference for tactical positioning over tax efficiency.`,
        signal: "tax",
      });
    }
  }

  // Time horizon pattern
  const longTerm = versions.filter(v =>
    v?.holding_period_bias === "Long-term" || v?.holding_period_bias === "Very Long-term"
  ).length;
  if (longTerm >= threshold) {
    insights.push({
      label: "Long-term holding bias",
      detail: `${longTerm} of ${n} strategies emphasise long or very long-term holding — patient capital orientation.`,
      signal: "time",
    });
  } else {
    const shortTerm = versions.filter(v =>
      v?.holding_period_bias === "Short-term" || v?.holding_period_bias === "Swing"
    ).length;
    if (shortTerm >= threshold) {
      insights.push({
        label: "Short-term / tactical horizon",
        detail: `${shortTerm} of ${n} strategies use short or swing-term horizons — consistent preference for active cycle timing.`,
        signal: "time",
      });
    }
  }

  // Risk level pattern
  const conservative = cards.filter(c => c.risk_level === "Conservative").length;
  const aggressive = cards.filter(c => c.risk_level === "Aggressive").length;
  const riskThreshold = Math.max(2, Math.ceil(cards.length * 0.55));
  if (conservative >= riskThreshold) {
    insights.push({
      label: "Systematically risk-averse",
      detail: `${conservative} of ${cards.length} strategies are conservative — capital preservation appears to be a core constraint.`,
      signal: "volatility",
    });
  } else if (aggressive >= riskThreshold) {
    insights.push({
      label: "Consistently high conviction",
      detail: `${aggressive} of ${cards.length} strategies carry aggressive risk — strong directional views expressed repeatedly.`,
      signal: "volatility",
    });
  }

  // Concentration pattern
  const posVersions = versions.filter(v => v?.max_position_pct != null);
  if (posVersions.length >= 2) {
    const concentrated = posVersions.filter(v => (v?.max_position_pct ?? 0) >= 20).length;
    const diversified   = posVersions.filter(v => (v?.max_position_pct ?? 100) <= 8).length;
    const posThreshold  = Math.max(2, Math.ceil(posVersions.length * 0.55));
    if (concentrated >= posThreshold) {
      insights.push({
        label: "Preference for concentrated positions",
        detail: `${concentrated} strategies allow max positions ≥20% — consistent high-conviction, low-diversification approach.`,
        signal: "concentration",
      });
    } else if (diversified >= posThreshold) {
      insights.push({
        label: "Diversification-first approach",
        detail: `${diversified} strategies cap single positions at ≤8% — systematic preference for broad exposure over concentration.`,
        signal: "concentration",
      });
    }
  }

  // Cash buffer pattern
  const cashVersions = versions.filter(v => v?.cash_min_pct != null);
  if (cashVersions.length >= 2) {
    const cashHeavy = cashVersions.filter(v => (v?.cash_min_pct ?? 0) >= 10).length;
    if (cashHeavy >= Math.max(2, Math.ceil(cashVersions.length * 0.55))) {
      insights.push({
        label: "Values cash optionality",
        detail: `${cashHeavy} strategies maintain ≥10% cash floors — consistent preference for dry powder and deployment flexibility.`,
        signal: "cash",
      });
    }
  }

  return insights.slice(0, 4);
}

// ── Visual constants ──────────────────────────────────────────────────────────

const ARCHETYPE_META: Record<string, { tagline: string; initial: string }> = {
  "Growth Compounder":    { tagline: "Patient capital. Long time horizons. Compounding conviction.",    initial: "GC" },
  "Growth Investor":      { tagline: "Earnings acceleration. Expansion plays. Upside asymmetry.",       initial: "GI" },
  "Value Investor":       { tagline: "Margin of safety. Disciplined patience. Contrarian edge.",        initial: "VI" },
  "Quality Investor":     { tagline: "Durable moats. Consistent returns. Premium but warranted.",       initial: "QI" },
  "Dividend Investor":    { tagline: "Predictable cash flow. Income-first. Steady compounding.",        initial: "DI" },
  "Defensive Investor":   { tagline: "Capital preservation. Resilience over upside. Steady hand.",      initial: "DF" },
  "Index Investor":       { tagline: "Low cost. Market returns. Evidence-based simplicity.",            initial: "IX" },
  "Momentum Investor":    { tagline: "Trend identification. Riding strength. Disciplined exits.",       initial: "MO" },
  "Speculative Trader":   { tagline: "High conviction. High risk. Asymmetric upside focus.",            initial: "SP" },
  "Contrarian Investor":  { tagline: "Mean reversion thesis. Buying discomfort. Patience required.",   initial: "CN" },
  "Balanced Investor":    { tagline: "Risk-adjusted returns. Diversified. Long-term stability.",        initial: "BL" },
  "Swing Trader":         { tagline: "Tactical entries. Short cycles. Technical precision.",            initial: "SW" },
  "Thematic Investor":    { tagline: "Macro trends. Sector concentration. Thesis-driven.",              initial: "TH" },
  "Independent Investor": { tagline: "Custom framework. Individual approach. Self-defined edge.",       initial: "IN" },
};

const SIGNAL_ICONS: Record<InsightSignal, React.ReactNode> = {
  tax:           <path d="M4 14l4-8 4 8M6 10h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>,
  volatility:    <path d="M2 10 C4 6, 6 14, 8 10 S12 6, 14 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none"/>,
  time:          <><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></>,
  concentration: <><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" opacity="0.4"/></>,
  cash:          <path d="M4 6h8M4 10h8M6 4v8M10 4v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>,
  style:         <path d="M3 12l3-4 3 4 3-5 3 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>,
};

import React from "react";

const FV = {
  bg:          "rgba(109,40,217,0.05)",
  bgMed:       "rgba(109,40,217,0.10)",
  border:      "rgba(109,40,217,0.18)",
  accent:      "#7c3aed",
  accentBright:"#8b5cf6",
} as const;

function InsightRow({ insight }: { insight: MemoryInsight }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <div style={{
        width: 20, height: 20, flexShrink: 0, marginTop: "1px",
        color: FV.accentBright,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          {SIGNAL_ICONS[insight.signal]}
        </svg>
      </div>
      <div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)", marginBottom: "2px" }}>
          {insight.label}
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {insight.detail}
        </div>
      </div>
    </div>
  );
}

export default function FinnProfileCard({
  profile,
  strategyCount,
  insights = [],
}: {
  profile: FinnProfile;
  strategyCount: number;
  insights?: MemoryInsight[];
}) {
  const meta = ARCHETYPE_META[profile.archetype] ?? {
    tagline: "Your investing identity, as understood by FINN.",
    initial: profile.archetype.slice(0, 2).toUpperCase(),
  };
  const updatedLabel = new Date(profile.updated_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div style={{
      borderRadius: "14px",
      border: `1px solid ${FV.border}`,
      background: FV.bg,
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FV.accent }}>
          FINN Investor Profile
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Updated {updatedLabel}
        </span>
      </div>

      {/* Archetype row */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: 40, height: 40, borderRadius: "10px", flexShrink: 0,
          background: FV.bgMed, border: `1px solid ${FV.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700,
          color: FV.accentBright,
        }}>
          {meta.initial}
        </div>
        <div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.3px" }}>
            {profile.archetype}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
            {meta.tagline}
          </div>
        </div>
      </div>

      {/* Traits */}
      {profile.traits.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {profile.traits.map(trait => (
            <span key={trait} style={{
              fontSize: "10px", fontWeight: 500,
              color: FV.accentBright, background: FV.bgMed,
              border: `1px solid ${FV.border}`, borderRadius: "6px", padding: "2px 8px",
            }}>
              {trait}
            </span>
          ))}
        </div>
      )}

      {/* Memory insights */}
      {insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: `1px solid ${FV.border}`, paddingTop: "12px" }}>
          <span style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: FV.accent }}>
            FINN has noticed
          </span>
          {insights.map((insight, i) => (
            <InsightRow key={i} insight={insight} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: "10px", color: "var(--text-muted)", borderTop: `1px solid ${FV.border}`, paddingTop: "8px" }}>
        Based on {strategyCount} {strategyCount === 1 ? "strategy" : "strategies"} — FINN infers your investor identity from strategy parameters
      </div>
    </div>
  );
}
