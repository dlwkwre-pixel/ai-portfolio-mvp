"use client";

import { useState, useEffect } from "react";

type RegimeData = {
  level: string;
  label: string;
  score: number;
  narrative: string;
};

const LEVEL_CFG: Record<string, { color: string; bg: string; border: string }> = {
  "risk-on":      { color: "#00d395", bg: "rgba(0,211,149,0.07)",   border: "rgba(0,211,149,0.18)"  },
  "constructive": { color: "#3b82f6", bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.18)" },
  "cautious":     { color: "#f59e0b", bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.18)" },
  "defensive":    { color: "#f97316", bg: "rgba(249,115,22,0.07)",  border: "rgba(249,115,22,0.18)" },
  "risk-off":     { color: "#ef4444", bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.18)"  },
};

export default function RegimeCompactBanner() {
  const [regime, setRegime] = useState<RegimeData | null>(null);

  useEffect(() => {
    fetch("/api/market/regime")
      .then((r) => r.json())
      .then((d) => { if (d?.level && d?.label) setRegime(d); })
      .catch(() => {});
  }, []);

  if (!regime) return null;

  const cfg = LEVEL_CFG[regime.level] ?? LEVEL_CFG["cautious"];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      padding: "9px 14px",
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: "var(--radius-lg)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.color }} />
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: cfg.color, fontFamily: "var(--font-body)" }}>
          {regime.label}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: cfg.color, fontWeight: 600, opacity: 0.8 }}>
          {regime.score}
        </span>
      </div>
      <span style={{ fontSize: "11px", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.4, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
        {regime.narrative}
      </span>
    </div>
  );
}
