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
  dotGlow: string;
}> = {
  "risk-on":      { color: "#00d395", bgColor: "rgba(0,211,149,0.04)",   borderColor: "rgba(0,211,149,0.15)",   dotGlow: "0 0 8px rgba(0,211,149,0.6)" },
  "constructive": { color: "#34d399", bgColor: "rgba(52,211,153,0.04)",  borderColor: "rgba(52,211,153,0.15)",  dotGlow: "0 0 6px rgba(52,211,153,0.5)" },
  "cautious":     { color: "#f59e0b", bgColor: "rgba(245,158,11,0.04)",  borderColor: "rgba(245,158,11,0.15)",  dotGlow: "0 0 6px rgba(245,158,11,0.5)" },
  "defensive":    { color: "#fb923c", bgColor: "rgba(251,146,60,0.04)",  borderColor: "rgba(251,146,60,0.15)",  dotGlow: "0 0 6px rgba(251,146,60,0.5)" },
  "risk-off":     { color: "#f87171", bgColor: "rgba(248,113,113,0.04)", borderColor: "rgba(248,113,113,0.15)", dotGlow: "0 0 8px rgba(248,113,113,0.6)" },
};

// ─── Static educational data ───────────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  macro: "Macro", growth: "Growth", volatility: "Stability",
  liquidity: "Liquidity", inflation: "Inflation",
};

const DIM_WEIGHTS: Record<string, number> = {
  macro: 0.30, growth: 0.25, volatility: 0.20, liquidity: 0.15, inflation: 0.10,
};

type DimComponent = { label: string; weight: number; signalKey?: string };

const DIM_INFO: Record<string, { desc: string; components: DimComponent[] }> = {
  macro: {
    desc: "Overall quality of the macroeconomic backdrop — are structural conditions favorable for risk-taking?",
    components: [
      { label: "Yield curve", weight: 40, signalKey: "yieldCurve" },
      { label: "Fed policy", weight: 35, signalKey: "fedPolicy" },
      { label: "Credit conditions", weight: 25, signalKey: "creditConditions" },
    ],
  },
  growth: {
    desc: "Equity market momentum and participation — is the trend broad-based and healthy?",
    components: [
      { label: "SPY 52-week position", weight: 40 },
      { label: "Market breadth", weight: 35, signalKey: "marketBreadth" },
      { label: "Sector rotation", weight: 25, signalKey: "sectorLeadership" },
    ],
  },
  volatility: {
    desc: "Market stability — low volatility allows fuller position sizing; elevated stress demands caution.",
    components: [
      { label: "Realized vol proxy (from SPY daily move)", weight: 100 },
    ],
  },
  liquidity: {
    desc: "Ease of credit and funding conditions — high liquidity supports risk assets and dealmaking.",
    components: [
      { label: "Credit conditions", weight: 50, signalKey: "creditConditions" },
      { label: "Yield curve", weight: 30, signalKey: "yieldCurve" },
      { label: "Fed policy", weight: 20, signalKey: "fedPolicy" },
    ],
  },
  inflation: {
    desc: "Inflation regime — benign inflation gives the Fed room to ease; elevated keeps policy restrictive.",
    components: [
      { label: "CPI (YoY)", weight: 60, signalKey: "inflation" },
      { label: "Employment", weight: 40, signalKey: "employment" },
    ],
  },
};

type LearnEntry = { title: string; desc: string; why: string };

const SIGNAL_LEARN: Record<string, LearnEntry> = {
  yieldCurve: {
    title: "Yield Curve (10Y − 2Y spread)",
    desc: "The difference between 10-year and 2-year U.S. Treasury yields. Positive = normal upward slope. Negative = inverted.",
    why: "An inverted yield curve has preceded every U.S. recession since 1950. It signals that bond markets expect growth to slow and the Fed to eventually cut rates.",
  },
  fedPolicy: {
    title: "Federal Funds Rate",
    desc: "The rate the Federal Reserve charges banks for overnight lending — the floor for all borrowing costs in the economy.",
    why: "Rate cuts boost equity valuations by lowering the discount rate applied to future earnings. Rate hikes compress multiples and raise the opportunity cost of owning stocks.",
  },
  inflation: {
    title: "CPI Inflation (YoY)",
    desc: "Year-over-year change in the Consumer Price Index. The Fed's target is ~2%.",
    why: "Above-target inflation keeps the Fed in restrictive mode, suppressing risk assets. Below target creates room for accommodation and market-supportive rate cuts.",
  },
  employment: {
    title: "Unemployment Rate",
    desc: "Percentage of the labor force actively seeking work. Part of the Fed's dual mandate alongside price stability.",
    why: "A tight labor market supports consumer spending and corporate earnings. Rising unemployment signals a weakening growth cycle and often precedes earnings disappointments.",
  },
  creditConditions: {
    title: "High Yield Credit Spread (OAS)",
    desc: "The extra yield investors demand for lending to below-investment-grade companies vs. risk-free Treasuries, in basis points.",
    why: "Widening spreads signal credit stress and risk aversion — historically a leading indicator of equity drawdowns. Tight spreads reflect abundant risk appetite.",
  },
  marketBreadth: {
    title: "Market Breadth (NYSE + NASDAQ)",
    desc: "Percentage of NYSE and NASDAQ stocks advancing vs. declining on a given day.",
    why: "A broad-based rally where most stocks participate is a sign of genuine market health. Rallies concentrated in a handful of mega-caps tend to be fragile and often reverse.",
  },
  sectorLeadership: {
    title: "Sector Rotation: Tech vs. Defensives",
    desc: "Daily return spread between the Technology ETF (XLK) and Utilities ETF (XLU). Positive = tech outperforming.",
    why: "Tech leading defensives signals risk-on appetite — investors are paying for growth expectations. Defensives outperforming is often early capital rotation toward safety ahead of broader weakness.",
  },
};

const SIGNAL_LABEL_MAP: Record<string, string> = {
  yieldCurve: "Yield curve",
  fedPolicy: "Fed policy",
  inflation: "Inflation",
  employment: "Employment",
  creditConditions: "Credit",
  marketBreadth: "Breadth",
  sectorLeadership: "Sector rotation",
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function DimensionBar({
  label, score, active, onClick,
}: {
  label: string; score: number; active: boolean; onClick: () => void;
}) {
  const barColor = score >= 65 ? "#00d395" : score >= 45 ? "#f59e0b" : "#f87171";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "8px", background: "none",
        border: "none", padding: "3px 0", cursor: "pointer", width: "100%",
        borderRadius: "3px", outline: active ? `1px solid ${barColor}22` : "none",
      }}
    >
      <span style={{
        fontSize: "10px", color: active ? barColor : "var(--text-muted)",
        width: "56px", flexShrink: 0, textAlign: "left", transition: "color 0.15s",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "3px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{
          width: `${score}%`, height: "100%", background: barColor,
          borderRadius: "2px", transition: "width 0.6s ease",
        }} />
      </div>
      <span style={{
        fontSize: "10px", fontFamily: "var(--font-mono)", color: barColor,
        width: "24px", textAlign: "right",
      }}>
        {score}
      </span>
      <svg
        width="8" height="8" viewBox="0 0 20 20" fill="currentColor"
        style={{ color: "var(--text-muted)", flexShrink: 0, transition: "transform 0.2s", transform: active ? "rotate(180deg)" : "rotate(0deg)" }}
      >
        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  );
}

function DimensionDetail({
  dimKey, regime,
}: {
  dimKey: string; regime: RegimeSnapshot;
}) {
  const info = DIM_INFO[dimKey];
  if (!info) return null;
  const signals = regime.signals as Record<string, string>;

  return (
    <div style={{
      marginTop: "2px", marginBottom: "4px", marginLeft: "64px",
      padding: "10px 12px", background: "var(--bg-elevated)",
      borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)",
    }}>
      <p style={{ fontSize: "10px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "8px" }}>
        {info.desc}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {info.components.map((c) => (
          <div key={c.label} style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "10px" }}>
            <span style={{
              flexShrink: 0, padding: "1px 5px", borderRadius: "3px",
              background: "var(--bg-base)", border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)", fontFamily: "var(--font-mono)",
            }}>
              {c.weight}%
            </span>
            <div>
              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{c.label}</span>
              {c.signalKey && signals[c.signalKey] && (
                <span style={{ color: "var(--text-secondary)", marginLeft: "6px" }}>
                  · {signals[c.signalKey]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalRow({
  signalKey, value, active, onClick,
}: {
  signalKey: string; value: string; active: boolean; onClick: () => void;
}) {
  const learn = SIGNAL_LEARN[signalKey];
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          background: active ? "rgba(255,255,255,0.03)" : "none",
          border: "none", padding: "4px 6px",
          cursor: learn ? "pointer" : "default", width: "100%",
          borderRadius: "4px", textAlign: "left",
        } as React.CSSProperties}
      >
        <span style={{
          fontSize: "11px", color: "var(--text-muted)",
          minWidth: "96px", flexShrink: 0,
        }}>
          {SIGNAL_LABEL_MAP[signalKey] ?? signalKey}
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-secondary)", flex: 1, textAlign: "left" }}>
          {value}
        </span>
        {learn && (
          <span style={{
            flexShrink: 0, fontSize: "9px", padding: "1px 5px",
            borderRadius: "3px", border: "1px solid var(--border-subtle)",
            color: active ? "var(--text-secondary)" : "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}>
            {active ? "×" : "?"}
          </span>
        )}
      </button>
      {active && learn && (
        <div style={{
          margin: "2px 6px 6px 6px", padding: "10px 12px",
          background: "var(--bg-elevated)", borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-subtle)",
        }}>
          <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            {learn.title}
          </p>
          <p style={{ fontSize: "10px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "6px" }}>
            {learn.desc}
          </p>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.6 }}>
            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Why it matters:</span> {learn.why}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

type Props = { compact?: boolean };

export default function MarketRegimeCard({ compact = false }: Props) {
  const [regime, setRegime] = useState<RegimeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignals, setShowSignals] = useState(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [activeSignal, setActiveSignal] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [showGaugeDetail, setShowGaugeDetail] = useState(false);

  useEffect(() => {
    fetch("/api/market/regime")
      .then((r) => r.json())
      .then((data) => { if (data && data.level) setRegime(data as RegimeSnapshot); })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/market/regime/history")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setHistory(data as HistoryPoint[]); })
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

        {/* Score gauge — click to see breakdown */}
        <button
          type="button"
          onClick={() => setShowGaugeDetail((v) => !v)}
          title="Click to see score breakdown"
          style={{
            position: "relative", width: "48px", height: "48px",
            background: "none", border: "none", cursor: "pointer", padding: 0,
            outline: showGaugeDetail ? `1px solid ${cfg.color}44` : "none",
            borderRadius: "50%",
          }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="24" cy="24" r="18" fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
            <circle
              cx="24" cy="24" r="18" fill="none"
              stroke={cfg.color} strokeWidth="4" strokeLinecap="round"
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
        </button>
      </div>

      {/* Score breakdown panel */}
      {showGaugeDetail && (
        <div style={{
          marginBottom: "14px", padding: "12px 14px",
          background: "var(--bg-elevated)", borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-subtle)",
        }}>
          <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            How the score is calculated
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            {Object.entries(regime.dimensions).map(([key, score]) => {
              const weight = DIM_WEIGHTS[key] ?? 0;
              const contribution = Math.round(score * weight * 10) / 10;
              const barColor = score >= 65 ? "#00d395" : score >= 45 ? "#f59e0b" : "#f87171";
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
                  <span style={{ width: "54px", color: "var(--text-muted)", flexShrink: 0 }}>{DIMENSION_LABELS[key]}</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)", width: "18px", textAlign: "right", flexShrink: 0 }}>{score}</span>
                  <span style={{ color: "var(--border-subtle)", flexShrink: 0 }}>×</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", width: "26px", flexShrink: 0 }}>{Math.round(weight * 100)}%</span>
                  <span style={{ color: "var(--border-subtle)", flexShrink: 0 }}>=</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: barColor, width: "30px", flexShrink: 0, fontWeight: 600 }}>{contribution}</span>
                  <div style={{ flex: 1, height: "2px", background: "var(--bg-base)", borderRadius: "1px", overflow: "hidden" }}>
                    <div style={{ width: `${score}%`, height: "100%", background: barColor, borderRadius: "1px", transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end" }}>
            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: cfg.color, fontWeight: 700 }}>
              = {regime.score} / 100
            </span>
          </div>
        </div>
      )}

      {/* Narrative */}
      <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>
        {regime.narrative}
      </p>

      {/* Dimension bars — clickable to reveal composition */}
      <p style={{ fontSize: "9px", color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
        Dimensions · click to explore
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginBottom: "12px" }}>
        {Object.entries(regime.dimensions).map(([key, score]) => (
          <div key={key}>
            <DimensionBar
              label={DIMENSION_LABELS[key] ?? key}
              score={score}
              active={activeDim === key}
              onClick={() => {
                setActiveDim(activeDim === key ? null : key);
                setActiveSignal(null);
              }}
            />
            {activeDim === key && (
              <DimensionDetail dimKey={key} regime={regime} />
            )}
          </div>
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

      {/* Signals panel — signal rows are clickable for learn panels */}
      <button
        type="button"
        onClick={() => setShowSignals((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none",
          cursor: "pointer", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", padding: 0,
        }}
      >
        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"
          style={{ transition: "transform 0.2s", transform: showSignals ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        {showSignals ? "Hide" : "Show"} underlying signals
      </button>

      {showSignals && (
        <div style={{ marginTop: "8px" }}>
          <p style={{ fontSize: "9px", color: "var(--text-muted)", marginBottom: "4px", paddingLeft: "6px", textTransform: "uppercase", letterSpacing: "0.07em" }}>
            Click a signal to learn more
          </p>
          {Object.entries(regime.signals).map(([key, value]) => (
            <SignalRow
              key={key}
              signalKey={key}
              value={String(value)}
              active={activeSignal === key}
              onClick={() => {
                setActiveSignal(activeSignal === key ? null : key);
                setActiveDim(null);
              }}
            />
          ))}
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "8px", paddingLeft: "6px" }}>
            {regime.dataQuality === "market-only"
              ? "FRED API key not configured — macro signals unavailable."
              : regime.dataQuality === "partial"
              ? "FRED macro active. Some extended signals unavailable."
              : `Updated ${new Date(regime.calculatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · Refreshes every 4h`}
          </p>
        </div>
      )}

      {/* 30-day regime trend timeline */}
      {history.length > 1 && (
        <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            30-day trend
          </p>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: "3px", alignItems: "flex-end" }}>
              {history.map((h) => {
                const dotCfg = LEVEL_CONFIG[h.level as RegimeLevel];
                const dateLabel = new Date(h.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const isHovered = hoveredBar === h.date;
                return (
                  <div
                    key={h.date}
                    onMouseEnter={() => setHoveredBar(h.date)}
                    onMouseLeave={() => setHoveredBar(null)}
                    style={{
                      position: "relative", flex: 1, minWidth: "4px", maxWidth: "14px",
                      display: "flex", flexDirection: "column", alignItems: "center",
                    }}
                  >
                    {isHovered && (
                      <div style={{
                        position: "absolute", bottom: "calc(100% + 4px)",
                        background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                        borderRadius: "4px", padding: "4px 7px", whiteSpace: "nowrap",
                        zIndex: 10, pointerEvents: "none",
                        left: "50%", transform: "translateX(-50%)",
                      }}>
                        <p style={{ fontSize: "9px", color: "var(--text-muted)", margin: 0 }}>{dateLabel}</p>
                        <p style={{ fontSize: "10px", fontWeight: 600, color: dotCfg?.color ?? "#64748b", margin: 0 }}>
                          {h.label} · {h.score}
                        </p>
                      </div>
                    )}
                    <div style={{
                      width: "100%",
                      height: `${Math.round(4 + (h.score / 100) * 12)}px`,
                      borderRadius: "2px",
                      background: dotCfg?.color ?? "#64748b",
                      opacity: isHovered ? 1 : 0.65,
                      transition: "opacity 0.1s",
                      cursor: "default",
                    }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
