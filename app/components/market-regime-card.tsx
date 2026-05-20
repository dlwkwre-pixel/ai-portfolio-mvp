"use client";

import { useState, useEffect } from "react";
import type { RegimeSnapshot, RegimeLevel } from "@/lib/market-data/regime";

type HistoryPoint = {
  date: string;
  level: RegimeLevel;
  score: number;
  label: string;
};

const LEVEL_CONFIG: Record<RegimeLevel, {
  color: string;
  bgColor: string;
  borderColor: string;
  barColor: string;
  dotGlow: string;
}> = {
  "risk-on": {
    color: "#00d395",
    bgColor: "rgba(0,211,149,0.04)",
    borderColor: "rgba(0,211,149,0.15)",
    barColor: "#00d395",
    dotGlow: "0 0 8px rgba(0,211,149,0.6)",
  },
  "constructive": {
    color: "#34d399",
    bgColor: "rgba(52,211,153,0.04)",
    borderColor: "rgba(52,211,153,0.15)",
    barColor: "#34d399",
    dotGlow: "0 0 6px rgba(52,211,153,0.5)",
  },
  "cautious": {
    color: "#f59e0b",
    bgColor: "rgba(245,158,11,0.04)",
    borderColor: "rgba(245,158,11,0.15)",
    barColor: "#f59e0b",
    dotGlow: "0 0 6px rgba(245,158,11,0.5)",
  },
  "defensive": {
    color: "#fb923c",
    bgColor: "rgba(251,146,60,0.04)",
    borderColor: "rgba(251,146,60,0.15)",
    barColor: "#fb923c",
    dotGlow: "0 0 6px rgba(251,146,60,0.5)",
  },
  "risk-off": {
    color: "#f87171",
    bgColor: "rgba(248,113,113,0.04)",
    borderColor: "rgba(248,113,113,0.15)",
    barColor: "#f87171",
    dotGlow: "0 0 8px rgba(248,113,113,0.6)",
  },
};

const DIMENSION_LABELS: Record<string, string> = {
  macro: "Macro",
  growth: "Growth",
  volatility: "Stability",
  liquidity: "Liquidity",
  inflation: "Inflation",
};

function DimensionBar({ label, score, color }: { label: string; score: number; color: string }) {
  const barColor = score >= 65 ? "#00d395" : score >= 45 ? "#f59e0b" : "#f87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "10px", color: "var(--text-muted)", width: "56px", flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: "3px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          width: `${score}%`, height: "100%",
          background: barColor, borderRadius: "2px",
          transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: barColor, width: "24px", textAlign: "right" }}>
        {score}
      </span>
    </div>
  );
}

type Props = {
  compact?: boolean;
};

export default function MarketRegimeCard({ compact = false }: Props) {
  const [regime, setRegime] = useState<RegimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignals, setShowSignals] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    fetch("/api/market/regime")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.level) setRegime(data as RegimeSnapshot);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch trend history independently — non-blocking
    fetch("/api/market/regime/history")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setHistory(data as HistoryPoint[]);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="bt-card" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--text-muted)", opacity: 0.4 }} />
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading market regime…</span>
      </div>
    );
  }

  if (!regime) return null;

  const cfg = LEVEL_CONFIG[regime.level];

  if (compact) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "8px 12px", background: cfg.bgColor,
        border: `1px solid ${cfg.borderColor}`, borderRadius: "var(--radius-md)",
      }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: cfg.color, boxShadow: cfg.dotGlow, flexShrink: 0 }} />
        <span style={{ fontSize: "11px", fontWeight: 600, color: cfg.color }}>{regime.label}</span>
        <span style={{ fontSize: "11px", color: "var(--text-secondary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {regime.narrative}
        </span>
        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: cfg.color, fontWeight: 600, flexShrink: 0 }}>
          {regime.score}
        </span>
      </div>
    );
  }

  return (
    <div style={{ background: cfg.bgColor, border: `1px solid ${cfg.borderColor}`, borderRadius: "var(--radius-lg)", padding: "16px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: cfg.color, boxShadow: cfg.dotGlow }} />
          <div>
            <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Market Regime
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "18px", fontFamily: "var(--font-display)", fontWeight: 700, color: cfg.color, letterSpacing: "-0.3px" }}>
                {regime.label}
              </span>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: cfg.color, opacity: 0.8 }}>
                {regime.score}/100
              </span>
            </div>
          </div>
        </div>

        {/* Score gauge */}
        <div style={{ position: "relative", width: "48px", height: "48px" }}>
          <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="24" cy="24" r="18" fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
            <circle
              cx="24" cy="24" r="18" fill="none"
              stroke={cfg.color} strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(regime.score / 100) * 113} 113`}
              style={{ transition: "stroke-dasharray 0.8s ease" }}
            />
          </svg>
          <span style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px", fontFamily: "var(--font-mono)", fontWeight: 700, color: cfg.color,
          }}>
            {regime.score}
          </span>
        </div>
      </div>

      {/* Narrative */}
      <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>
        {regime.narrative}
      </p>

      {/* Dimension bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
        {Object.entries(regime.dimensions).map(([key, score]) => (
          <DimensionBar
            key={key}
            label={DIMENSION_LABELS[key] ?? key}
            score={score}
            color={cfg.color}
          />
        ))}
      </div>

      {/* Portfolio modifier hints */}
      {(regime.modifiers.positionSizingDelta !== 0 || regime.modifiers.cashAllocationDelta !== 0) && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
          {regime.modifiers.positionSizingDelta !== 0 && (
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
              Position sizing {regime.modifiers.positionSizingDelta > 0 ? "+" : ""}{regime.modifiers.positionSizingDelta}%
            </span>
          )}
          {regime.modifiers.cashAllocationDelta !== 0 && (
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
              Cash target {regime.modifiers.cashAllocationDelta > 0 ? "+" : ""}{regime.modifiers.cashAllocationDelta}%
            </span>
          )}
          {regime.modifiers.convictionDelta !== 0 && (
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
              Conviction bar {regime.modifiers.convictionDelta > 0 ? "+" : ""}{regime.modifiers.convictionDelta}%
            </span>
          )}
        </div>
      )}

      {/* Expandable signals */}
      <button
        type="button"
        onClick={() => setShowSignals((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none",
          cursor: "pointer", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", padding: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" style={{ transition: "transform 0.2s", transform: showSignals ? "rotate(180deg)" : "rotate(0deg)" }}>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        {showSignals ? "Hide" : "Show"} underlying signals
      </button>

      {showSignals && (
        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {Object.entries(regime.signals).map(([key, value]) => {
            const labelMap: Record<string, string> = {
              yieldCurve: "Yield curve",
              fedPolicy: "Fed policy",
              inflation: "Inflation",
              employment: "Employment",
              creditConditions: "Credit",
              marketBreadth: "Breadth",
              sectorLeadership: "Sector rotation",
            };
            return (
              <div key={key} style={{ display: "flex", gap: "8px", fontSize: "11px" }}>
                <span style={{ color: "var(--text-muted)", minWidth: "96px", flexShrink: 0 }}>{labelMap[key] ?? key}</span>
                <span style={{ color: "var(--text-secondary)" }}>{String(value)}</span>
              </div>
            );
          })}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>
            {regime.dataQuality === "market-only"
              ? "FRED API key not configured — macro signals unavailable. Add FRED_API_KEY to enable full regime."
              : regime.dataQuality === "partial"
              ? "FRED macro active. Breadth or sector data unavailable — regime calculated from partial signals."
              : `Updated ${new Date(regime.calculatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · Refreshes every 4h`}
          </p>
        </div>
      )}

      {/* 30-day regime trend timeline */}
      {history.length > 1 && (
        <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            30-day trend
          </p>
          <div style={{ display: "flex", gap: "3px", alignItems: "flex-end" }}>
            {history.map((h) => {
              const dotCfg = LEVEL_CONFIG[h.level as RegimeLevel];
              const dateLabel = new Date(h.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
              return (
                <div
                  key={h.date}
                  title={`${dateLabel}: ${h.label} (${h.score})`}
                  style={{
                    flex: 1,
                    height: `${Math.round(4 + (h.score / 100) * 12)}px`,
                    borderRadius: "2px",
                    background: dotCfg?.color ?? "#64748b",
                    opacity: 0.75,
                    cursor: "default",
                    minWidth: "4px",
                    maxWidth: "14px",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
