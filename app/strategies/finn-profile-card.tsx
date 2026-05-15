"use client";

import type { FinnProfile } from "./finn-profile-actions";

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

const FV = {
  bg:          "rgba(109,40,217,0.05)",
  bgMed:       "rgba(109,40,217,0.10)",
  border:      "rgba(109,40,217,0.18)",
  accent:      "#7c3aed",
  accentBright:"#8b5cf6",
} as const;

export default function FinnProfileCard({
  profile,
  strategyCount,
}: {
  profile: FinnProfile;
  strategyCount: number;
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
      gap: "10px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{
          fontSize: "9px", fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", color: FV.accent,
        }}>
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
          <div style={{
            fontSize: "15px", fontWeight: 700, color: "var(--text-primary)",
            fontFamily: "var(--font-display)", letterSpacing: "-0.3px",
          }}>
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
              color: FV.accentBright,
              background: FV.bgMed,
              border: `1px solid ${FV.border}`,
              borderRadius: "6px",
              padding: "2px 8px",
            }}>
              {trait}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        fontSize: "10px", color: "var(--text-muted)",
        borderTop: `1px solid ${FV.border}`, paddingTop: "8px",
      }}>
        Based on {strategyCount} {strategyCount === 1 ? "strategy" : "strategies"} — FINN infers your investor identity from strategy parameters
      </div>
    </div>
  );
}
