"use client";

import type { FinnProfile } from "./finn-profile-actions";
import type { InsightSignal, MemoryInsight } from "./finn-profile-utils";

export type { InsightSignal, MemoryInsight };

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
  accent:      "#3fae4a",
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
    tagline: "Your investing identity, as understood by Atlas.",
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
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: FV.accent }}>
          Atlas Investor Profile
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
          <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: FV.accent }}>
            Atlas has noticed
          </span>
          {insights.map((insight, i) => (
            <InsightRow key={i} insight={insight} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: "10px", color: "var(--text-muted)", borderTop: `1px solid ${FV.border}`, paddingTop: "8px" }}>
        Based on {strategyCount} {strategyCount === 1 ? "strategy" : "strategies"} — Atlas infers your investor identity from strategy parameters
      </div>
    </div>
  );
}
