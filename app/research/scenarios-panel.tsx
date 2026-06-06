"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { MacroScenario } from "@/lib/scenarios/macro-plays";
import type { ScenarioSignal } from "@/app/api/scenarios/signals/route";
import type { ScenarioQuote } from "@/app/api/scenarios/quotes/route";
import type { AIGeneratedScenario } from "@/app/api/scenarios/generated/route";

// ─── Signal level ────────────────────────────────────────────────────────────

type SignalLevel = "cold" | "warming" | "active" | "hot";

function signalLevel(count: number): SignalLevel {
  if (count === 0)  return "cold";
  if (count <= 4)   return "warming";
  if (count <= 11)  return "active";
  return "hot";
}

const SIGNAL_CONFIG: Record<SignalLevel, { label: string; color: string; bg: string; dot: string; tooltip: string }> = {
  cold:    { label: "No Signal",  color: "var(--text-muted)",    bg: "rgba(255,255,255,0.04)", dot: "var(--border)",  tooltip: "No news triggers detected. This scenario is not currently in play." },
  warming: { label: "Warming",    color: "#f59e0b",              bg: "rgba(245,158,11,0.1)",  dot: "#f59e0b",        tooltip: "1–4 headlines matched. Early signs this scenario may be developing — worth watching." },
  active:  { label: "Active",     color: "#3b82f6",              bg: "rgba(59,130,246,0.12)", dot: "#3b82f6",        tooltip: "5–11 headlines matched. This scenario is building real momentum across the news cycle." },
  hot:     { label: "Hot Signal", color: "#ef4444",              bg: "rgba(239,68,68,0.12)",  dot: "#ef4444",        tooltip: "12+ headlines matched. This scenario is dominating coverage and may be actively playing out." },
};

const CATEGORY_COLORS: Record<string, string> = {
  energy:       "#f59e0b",
  monetary:     "#8b5cf6",
  geopolitical: "#ef4444",
  tech:         "#3b82f6",
  economy:      "#10b981",
  policy:       "#6366f1",
  markets:      "#ec4899",
};

// ─── Signal badge with custom tooltip ────────────────────────────────────────

function SignalBadge({ cfg, level, count }: {
  cfg: typeof SIGNAL_CONFIG[SignalLevel];
  level: SignalLevel;
  count: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTipPos({ top: r.top + window.scrollY, left: r.left + r.width / 2 });
  }

  const isDark = level !== "cold";

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setTipPos(null)}
        style={{
          fontSize: "9px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "2px 7px",
          borderRadius: "var(--radius-full)",
          background: cfg.bg,
          color: cfg.color,
          border: `1px solid ${cfg.color}40`,
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          cursor: "help",
          userSelect: "none",
        }}
      >
        <span style={{
          width: "5px", height: "5px",
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
          ...(level === "hot" ? { boxShadow: `0 0 4px ${cfg.dot}` } : {}),
        }} />
        {cfg.label}
        {count > 0 && ` · ${count}`}
      </span>

      {tipPos && typeof document !== "undefined" && createPortal(
        <div
          style={{
            position: "absolute",
            top: tipPos.top - 10,
            left: tipPos.left,
            transform: "translate(-50%, -100%)",
            background: isDark
              ? `color-mix(in srgb, ${cfg.color} 12%, var(--bg-elevated, #0d1120))`
              : "var(--bg-elevated, #0d1120)",
            border: `1px solid ${isDark ? cfg.color + "50" : "rgba(255,255,255,0.12)"}`,
            color: cfg.color,
            fontSize: "11px",
            fontWeight: 500,
            lineHeight: 1.45,
            padding: "7px 11px",
            borderRadius: "8px",
            maxWidth: "220px",
            whiteSpace: "normal",
            textAlign: "center",
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: isDark
              ? `0 4px 16px ${cfg.color}20, 0 2px 6px rgba(0,0,0,0.4)`
              : "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          {cfg.tooltip}
          {/* Caret */}
          <span style={{
            position: "absolute",
            bottom: -5,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: `5px solid ${isDark ? cfg.color + "50" : "rgba(255,255,255,0.12)"}`,
          }} />
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(unix: number) {
  if (!unix) return "";
  const diff = Date.now() / 1000 - unix;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatPct(n: number | null) {
  if (n == null) return null;
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// ─── ScenarioCard ─────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  signal,
  quotes,
  onTickerClick,
  isAI,
  triggerContext,
}: {
  scenario: MacroScenario;
  signal: ScenarioSignal | null;
  quotes: ScenarioQuote[];
  onTickerClick?: (ticker: string) => void;
  isAI?: boolean;
  triggerContext?: string | null;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [showAllLong, setShowAllLong]     = useState(false);
  const [showAllAvoid, setShowAllAvoid]   = useState(false);
  const [likelihood, setLikelihood]       = useState<import("@/app/api/scenarios/likelihood/route").LikelihoodResult | null>(null);
  const [likelihoodLoading, setLikelihoodLoading] = useState(false);

  const PREVIEW_COUNT = 3;

  async function fetchLikelihood() {
    if (likelihood || likelihoodLoading) return;
    setLikelihoodLoading(true);
    try {
      const res = await fetch("/api/scenarios/likelihood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          title: scenario.title,
          thesis: scenario.thesis,
          timeHorizon: scenario.timeHorizon,
          signalCount: count,
          headlines: signal?.headlines ?? [],
        }),
      });
      if (res.ok) setLikelihood(await res.json());
    } finally {
      setLikelihoodLoading(false);
    }
  }

  const count = signal?.count ?? 0;
  const level = signalLevel(count);
  const cfg = SIGNAL_CONFIG[level];
  const catColor = CATEGORY_COLORS[scenario.category] ?? "var(--text-muted)";

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !quotesLoaded && !loadingQuotes) {
      setLoadingQuotes(true);
      const allTickers = [...scenario.long, ...scenario.avoid].map((t) => t.ticker).join(",");
      try {
        await fetch(`/api/scenarios/quotes?tickers=${allTickers}`);
        setQuotesLoaded(true);
      } finally {
        setLoadingQuotes(false);
      }
    }
  }

  const quoteMap = new Map(quotes.map((q) => [q.ticker, q]));

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: `1px solid var(--border-subtle)`,
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        transition: "border-color 0.15s",
      }}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={handleExpand}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          padding: "16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Emoji badge */}
        <div style={{
          width: "40px", height: "40px", flexShrink: 0,
          borderRadius: "var(--radius-md)",
          background: `${catColor}18`,
          border: `1px solid ${catColor}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px",
        }}>
          {scenario.emoji}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "var(--font-display)",
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.1px",
            }}>
              {scenario.title}
            </span>

            {/* Signal badge */}
            <SignalBadge cfg={cfg} level={level} count={count} />

            {/* AI-generated badge */}
            {isAI && (
              <span
                title="Generated daily by AI based on current news headlines"
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(139,92,246,0.12)",
                  color: "#a78bfa",
                  border: "1px solid rgba(139,92,246,0.3)",
                  cursor: "help",
                }}
              >
                AI
              </span>
            )}
          </div>

          {/* Tags row */}
          <div style={{ display: "flex", gap: "4px", marginTop: "5px", flexWrap: "wrap" }}>
            {scenario.tags.map((tag) => (
              <span key={tag} style={{
                fontSize: "9px", fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                padding: "1px 6px",
                borderRadius: "var(--radius-full)",
                background: "rgba(255,255,255,0.05)",
                color: "var(--text-tertiary)",
                border: "1px solid var(--border-subtle)",
              }}>
                {tag}
              </span>
            ))}
            <span style={{
              fontSize: "9px", color: "var(--text-muted)",
              padding: "1px 6px",
            }}>
              {scenario.timeHorizon} horizon
            </span>
          </div>

          {/* Thesis preview (collapsed) */}
          {!expanded && (
            <p style={{
              fontSize: "11px",
              color: "var(--text-tertiary)",
              marginTop: "6px",
              lineHeight: 1.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}>
              {scenario.thesis}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          width="16" height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="1.5"
          style={{
            flexShrink: 0,
            marginTop: "2px",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "14px" }} />

          {/* AI trigger context */}
          {isAI && triggerContext && (
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "7px",
              padding: "7px 10px",
              borderRadius: "var(--radius-md)",
              background: "rgba(139,92,246,0.06)",
              border: "1px solid rgba(139,92,246,0.18)",
              marginBottom: "12px",
            }}>
              <span style={{ fontSize: "11px", flexShrink: 0 }}>⚡</span>
              <span style={{ fontSize: "11px", color: "#c4b5fd", lineHeight: 1.4 }}>
                {triggerContext}
              </span>
            </div>
          )}

          {/* Thesis */}
          <p style={{
            fontSize: "12px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            marginBottom: "16px",
          }}>
            {scenario.thesis}
          </p>

          {/* News signals */}
          {(signal?.headlines?.length ?? 0) > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{
                fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.1em", color: cfg.color, marginBottom: "8px",
              }}>
                Current Signals ({signal!.count} headline{signal!.count !== 1 ? "s" : ""})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {signal!.headlines.map((h, i) => (
                  <a
                    key={i}
                    href={h.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-md)",
                      background: `${cfg.color}08`,
                      border: `1px solid ${cfg.color}20`,
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ fontSize: "11px", color: "var(--text-primary)", lineHeight: 1.4, fontWeight: 500 }}>
                      {h.headline}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {h.source} · {timeAgo(h.datetime)}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Long plays */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "8px",
            }}>
              <span style={{
                fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "var(--green)",
              }}>
                Positioned to Benefit
                <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "5px" }}>
                  ({scenario.long.length})
                </span>
              </span>
              {scenario.long.length > PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowAllLong((v) => !v); }}
                  style={{
                    fontSize: "10px", fontWeight: 600,
                    color: "var(--green)",
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: "var(--radius-full)",
                    padding: "2px 9px",
                    cursor: "pointer",
                  }}
                >
                  {showAllLong ? "Show less" : `+${scenario.long.length - PREVIEW_COUNT} more`}
                </button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {(showAllLong ? scenario.long : scenario.long.slice(0, PREVIEW_COUNT)).map((play) => {
                const q = quoteMap.get(play.ticker);
                const pct = q?.changePct ?? null;
                const pctStr = formatPct(pct);
                const clickable = !!onTickerClick;
                return (
                  <button
                    key={play.ticker}
                    type="button"
                    onClick={clickable ? () => onTickerClick!(play.ticker) : undefined}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(16,185,129,0.05)",
                      border: "1px solid rgba(16,185,129,0.12)",
                      width: "100%",
                      textAlign: "left",
                      cursor: clickable ? "pointer" : "default",
                      transition: clickable ? "background 0.12s, border-color 0.12s" : undefined,
                    }}
                    onMouseEnter={clickable ? (e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(16,185,129,0.25)"; } : undefined}
                    onMouseLeave={clickable ? (e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(16,185,129,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(16,185,129,0.12)"; } : undefined}
                  >
                    <div style={{
                      width: "36px", flexShrink: 0,
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px", fontWeight: 700,
                      color: "var(--green)",
                      paddingTop: "1px",
                    }}>
                      {play.ticker}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-primary)" }}>
                          {play.name}
                        </span>
                        {q?.price != null && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>
                            ${q.price.toFixed(2)}
                          </span>
                        )}
                        {pctStr && (
                          <span style={{
                            fontSize: "10px",
                            fontFamily: "var(--font-mono)",
                            color: (pct ?? 0) >= 0 ? "var(--green)" : "var(--red)",
                          }}>
                            {pctStr}
                          </span>
                        )}
                        {clickable && (
                          <span style={{ marginLeft: "auto", fontSize: "9px", color: "var(--text-muted)" }}>View →</span>
                        )}
                      </div>
                      <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px", lineHeight: 1.4 }}>
                        {play.reason}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Avoid plays */}
          {scenario.avoid.length > 0 && (
            <div>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "8px",
              }}>
                <span style={{
                  fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.1em", color: "var(--red)",
                }}>
                  Likely to Underperform
                  <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "5px" }}>
                    ({scenario.avoid.length})
                  </span>
                </span>
                {scenario.avoid.length > PREVIEW_COUNT && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowAllAvoid((v) => !v); }}
                    style={{
                      fontSize: "10px", fontWeight: 600,
                      color: "var(--red)",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: "var(--radius-full)",
                      padding: "2px 9px",
                      cursor: "pointer",
                    }}
                  >
                    {showAllAvoid ? "Show less" : `+${scenario.avoid.length - PREVIEW_COUNT} more`}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {(showAllAvoid ? scenario.avoid : scenario.avoid.slice(0, PREVIEW_COUNT)).map((play) => {
                  const q = quoteMap.get(play.ticker);
                  const pct = q?.changePct ?? null;
                  const pctStr = formatPct(pct);
                  const clickable = !!onTickerClick;
                  return (
                    <button
                      key={play.ticker}
                      type="button"
                      onClick={clickable ? () => onTickerClick!(play.ticker) : undefined}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(239,68,68,0.05)",
                        border: "1px solid rgba(239,68,68,0.12)",
                        width: "100%",
                        textAlign: "left",
                        cursor: clickable ? "pointer" : "default",
                        transition: clickable ? "background 0.12s, border-color 0.12s" : undefined,
                      }}
                      onMouseEnter={clickable ? (e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.25)"; } : undefined}
                      onMouseLeave={clickable ? (e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.05)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(239,68,68,0.12)"; } : undefined}
                    >
                      <div style={{
                        width: "36px", flexShrink: 0,
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px", fontWeight: 700,
                        color: "var(--red)",
                        paddingTop: "1px",
                      }}>
                        {play.ticker}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-primary)" }}>
                            {play.name}
                          </span>
                          {q?.price != null && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-secondary)" }}>
                              ${q.price.toFixed(2)}
                            </span>
                          )}
                          {pctStr && (
                            <span style={{
                              fontSize: "10px",
                              fontFamily: "var(--font-mono)",
                              color: (pct ?? 0) >= 0 ? "var(--green)" : "var(--red)",
                            }}>
                              {pctStr}
                            </span>
                          )}
                          {clickable && (
                            <span style={{ marginLeft: "auto", fontSize: "9px", color: "var(--text-muted)" }}>View →</span>
                          )}
                        </div>
                        <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px", lineHeight: 1.4 }}>
                          {play.reason}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Likelihood analysis */}
          <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}>
            {!likelihood && !likelihoodLoading && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); fetchLikelihood(); }}
                style={{
                  width: "100%",
                  padding: "9px 14px",
                  borderRadius: "var(--radius-md)",
                  background: "rgba(139,92,246,0.07)",
                  border: "1px solid rgba(139,92,246,0.2)",
                  color: "#c4b5fd",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "7px",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.14)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(139,92,246,0.07)"; }}
              >
                <span>✦</span>
                Ask FINN — How likely is this scenario?
              </button>
            )}

            {likelihoodLoading && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                padding: "12px", color: "#a78bfa", fontSize: "12px",
              }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="24" strokeDashoffset="8">
                    <animateTransform attributeName="transform" type="rotate" from="0 7 7" to="360 7 7" dur="0.8s" repeatCount="indefinite" />
                  </circle>
                </svg>
                Analyzing likelihood...
              </div>
            )}

            {likelihood && (() => {
              const RATING_COLOR: Record<string, string> = {
                very_low: "#64748b", low: "#94a3b8", moderate: "#f59e0b",
                high: "#3b82f6", very_high: "#ef4444",
              };
              const RATING_LABEL: Record<string, string> = {
                very_low: "Very Low", low: "Low", moderate: "Moderate",
                high: "High", very_high: "Very High",
              };
              const rColor = RATING_COLOR[likelihood.rating] ?? "#94a3b8";
              const rLabel = RATING_LABEL[likelihood.rating] ?? likelihood.rating;
              return (
                <div style={{
                  padding: "12px 14px",
                  borderRadius: "var(--radius-md)",
                  background: `${rColor}08`,
                  border: `1px solid ${rColor}25`,
                }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#a78bfa" }}>
                        ✦ FINN Analysis
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{
                        fontSize: "11px", fontWeight: 700,
                        color: rColor,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        background: `${rColor}15`,
                        border: `1px solid ${rColor}30`,
                      }}>
                        {rLabel}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: rColor }}>
                        {likelihood.pct}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: "10px" }}>
                    {likelihood.reasoning}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                    {[
                      { label: "Accelerators", items: likelihood.key_drivers, color: "var(--green)" },
                      { label: "Blockers", items: likelihood.key_risks, color: "var(--red)" },
                    ].map(({ label, items, color }) => (
                      <div key={label}>
                        <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color, marginBottom: "5px" }}>
                          {label}
                        </div>
                        <ul style={{ margin: 0, padding: "0 0 0 12px" }}>
                          {items.map((d, i) => (
                            <li key={i} style={{ fontSize: "10px", color: "var(--text-tertiary)", lineHeight: 1.4, marginBottom: "3px" }}>
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: "10px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    {likelihood.timeframe}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ScenariosPanel ───────────────────────────────────────────────────────────

// Maps an AI-generated scenario row to the MacroScenario shape ScenarioCard expects
function aiToMacro(s: AIGeneratedScenario): MacroScenario {
  return {
    id: s.scenario_key,
    emoji: s.emoji,
    title: s.title,
    thesis: s.thesis,
    tags: Array.isArray(s.tags) ? s.tags : [],
    keywords: Array.isArray(s.keywords) ? s.keywords : [],
    long:  Array.isArray(s.long_plays)  ? s.long_plays  : [],
    avoid: Array.isArray(s.avoid_plays) ? s.avoid_plays : [],
    timeHorizon: (["days","weeks","months","years"].includes(s.time_horizon)
      ? s.time_horizon : "weeks") as MacroScenario["timeHorizon"],
    category: (s.category as MacroScenario["category"]) || "markets",
  };
}

export default function ScenariosPanel({ onTickerClick }: { onTickerClick?: (ticker: string) => void }) {
  const [signals, setSignals]           = useState<ScenarioSignal[]>([]);
  const [quotes, setQuotes]             = useState<ScenarioQuote[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [signalFilter, setSignalFilter] = useState<"all" | "hot" | "signals">("all");
  const [aiScenarios, setAiScenarios]   = useState<AIGeneratedScenario[]>([]);

  const loadSignals = useCallback(async () => {
    setLoading(true);
    try {
      const [sigRes, aiRes] = await Promise.allSettled([
        fetch("/api/scenarios/signals"),
        fetch("/api/scenarios/generated"),
      ]);
      if (sigRes.status === "fulfilled" && sigRes.value.ok) {
        setSignals(await sigRes.value.json());
      }
      if (aiRes.status === "fulfilled" && aiRes.value.ok) {
        setAiScenarios(await aiRes.value.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  // Preload quotes for top-signal AI scenarios
  useEffect(() => {
    if (!signals.length || !aiScenarios.length) return;
    const sigMap = new Map(signals.map((s) => [s.scenarioId, s.count]));
    const topTickers = [...aiScenarios]
      .sort((a, b) => (sigMap.get(b.scenario_key) ?? 0) - (sigMap.get(a.scenario_key) ?? 0))
      .slice(0, 5)
      .flatMap((s) => [...(s.long_plays ?? []), ...(s.avoid_plays ?? [])].map((t) => t.ticker))
      .slice(0, 20)
      .join(",");
    if (!topTickers) return;
    fetch(`/api/scenarios/quotes?tickers=${topTickers}`)
      .then((r) => r.json())
      .then((data: ScenarioQuote[]) => setQuotes(data))
      .catch(() => {});
  }, [signals, aiScenarios]);

  const signalById = new Map(signals.map((s) => [s.scenarioId, s]));

  const categories = [
    { id: "all", label: "All" },
    { id: "geopolitical", label: "Geopolitical" },
    { id: "energy", label: "Energy" },
    { id: "monetary", label: "Monetary" },
    { id: "tech", label: "Tech" },
    { id: "economy", label: "Economy" },
    { id: "markets", label: "Markets" },
    { id: "policy", label: "Policy" },
  ];

  const allScenarios = aiScenarios.map(aiToMacro);

  const filteredScenarios = allScenarios.filter((s) => {
    if (activeCategory !== "all" && s.category !== activeCategory) return false;
    const cnt = signalById.get(s.id)?.count ?? 0;
    if (signalFilter === "hot")     return cnt >= 12;
    if (signalFilter === "signals") return cnt >= 1;
    return true;
  });

  const sorted = [...filteredScenarios].sort((a, b) => {
    const ca = signalById.get(a.id)?.count ?? 0;
    const cb = signalById.get(b.id)?.count ?? 0;
    return cb - ca;
  });

  const hotCount = signals.filter((s) => s.count >= 12).length;
  const activeCount = signals.filter((s) => s.count >= 1).length;

  return (
    <div>
      {/* Header */}
      <div style={{
        marginBottom: "20px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "12px",
      }}>
        <div>
          <h2 style={{
            fontFamily: "var(--font-display)",
            fontSize: "15px",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.2px",
            marginBottom: "4px",
          }}>
            If/Then Macro Plays
          </h2>
          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            Forward-looking scenarios with pre-positioning plays. Scenarios ranked by current news signal strength.
          </p>
        </div>

        {/* Signal filter buttons */}
        {!loading && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {hotCount > 0 && (
              <button
                type="button"
                onClick={() => setSignalFilter((f) => f === "hot" ? "all" : "hot")}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  background: signalFilter === "hot" ? "rgba(239,68,68,0.2)" : "rgba(239,68,68,0.1)",
                  border: signalFilter === "hot" ? "1px solid rgba(239,68,68,0.6)" : "1px solid rgba(239,68,68,0.25)",
                  cursor: "pointer",
                  transition: "background 0.12s, border-color 0.12s",
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#ef4444" }}>
                  {hotCount} Hot
                </span>
              </button>
            )}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => setSignalFilter((f) => f === "signals" ? "all" : "signals")}
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-full)",
                  background: signalFilter === "signals" ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.1)",
                  border: signalFilter === "signals" ? "1px solid rgba(59,130,246,0.6)" : "1px solid rgba(59,130,246,0.25)",
                  cursor: "pointer",
                  transition: "background 0.12s, border-color 0.12s",
                }}
              >
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }} />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "#3b82f6" }}>
                  {activeCount} w/ Signals
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Category filter chips */}
      <div style={{
        display: "flex",
        gap: "6px",
        overflowX: "auto",
        paddingBottom: "4px",
        marginBottom: "16px",
        scrollbarWidth: "none",
      }}>
        {categories.map(({ id, label }) => {
          const active = activeCategory === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => { setActiveCategory(id); setSignalFilter("all"); }}
              style={{
                flexShrink: 0,
                padding: "5px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: "11px",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                border: active ? "1px solid var(--brand-blue)" : "1px solid var(--border-subtle)",
                background: active ? "rgba(37,99,235,0.15)" : "var(--bg-card)",
                color: active ? "var(--brand-blue)" : "var(--text-secondary)",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {id !== "all" && (() => {
                const cnt = aiScenarios.filter((s) => s.category === id && (signalById.get(s.scenario_key)?.count ?? 0) > 0).length;
                return cnt > 0 ? (
                  <span style={{
                    marginLeft: "4px",
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    color: active ? "var(--brand-blue)" : "#3b82f6",
                  }}>
                    {cnt}
                  </span>
                ) : null;
              })()}
            </button>
          );
        })}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bt-skeleton"
              style={{ height: "78px", borderRadius: "var(--radius-lg)" }}
            />
          ))}
        </div>
      )}

      {/* Scenario cards */}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {sorted.map((scenario) => {
            const aiRow = aiScenarios.find((s) => s.scenario_key === scenario.id);
            return (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                signal={signalById.get(scenario.id) ?? null}
                quotes={quotes}
                onTickerClick={onTickerClick}
                isAI
                triggerContext={aiRow?.trigger_context ?? null}
              />
            );
          })}
        </div>
      )}

      {/* Disclaimer */}
      <p style={{
        fontSize: "10px",
        color: "var(--text-muted)",
        marginTop: "20px",
        lineHeight: 1.5,
        textAlign: "center",
      }}>
        Macro plays are hypothetical pre-positioning ideas, not investment advice. News signal counts are based on recent market headlines.
      </p>
    </div>
  );
}
