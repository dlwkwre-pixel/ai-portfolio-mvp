"use client";

import { useState, useEffect } from "react";

type RegimeData = {
  level: string;
  label: string;
  score: number;
  narrative: string;
};

const LEVEL_CFG: Record<string, { color: string; bg: string; border: string }> = {
  "risk-on":      { color: "var(--green)", bg: "rgba(0,211,149,0.07)",   border: "rgba(0,211,149,0.18)"  },
  "constructive": { color: "#3b82f6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)" },
  "cautious":     { color: "#f59e0b", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)" },
  "defensive":    { color: "#f97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)" },
  "risk-off":     { color: "var(--red)", bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)"  },
};

export default function RegimeCompactBanner() {
  const [regime, setRegime] = useState<RegimeData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/market/regime")
      .then((r) => r.json())
      .then((d) => { if (d?.level && d?.label) setRegime(d); })
      .catch(() => {});
  }, []);

  if (!regime) return null;

  const cfg = LEVEL_CFG[regime.level] ?? LEVEL_CFG["cautious"];

  return (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      style={{
        display: "flex", alignItems: expanded ? "flex-start" : "center", gap: "10px",
        padding: "9px 14px", width: "100%", textAlign: "left", cursor: "pointer",
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: "var(--radius-lg)",
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginTop: expanded ? "1px" : 0 }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.color }} />
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: cfg.color, fontFamily: "var(--font-body)" }}>
          {regime.label}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: cfg.color, fontWeight: 600, opacity: 0.8 }}>
          {regime.score}
        </span>
      </div>
      <span style={{
        fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)",
        lineHeight: 1.5, flex: 1, minWidth: 0,
        ...(expanded
          ? {}
          : { overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }),
      }}>
        {regime.narrative}
      </span>
      <svg
        width="12" height="12" viewBox="0 0 20 20" fill={cfg.color}
        style={{ flexShrink: 0, marginTop: expanded ? "3px" : 0, transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </button>
  );
}
