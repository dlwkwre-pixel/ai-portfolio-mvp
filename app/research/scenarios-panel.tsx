"use client";

import { useState, useEffect, useCallback } from "react";
import { MACRO_SCENARIOS, MacroScenario } from "@/lib/scenarios/macro-plays";
import type { ScenarioSignal } from "@/app/api/scenarios/signals/route";
import type { ScenarioQuote } from "@/app/api/scenarios/quotes/route";

// ─── Signal level ────────────────────────────────────────────────────────────

type SignalLevel = "cold" | "warming" | "active" | "hot";

function signalLevel(count: number): SignalLevel {
  if (count === 0) return "cold";
  if (count === 1) return "warming";
  if (count <= 3) return "active";
  return "hot";
}

const SIGNAL_CONFIG: Record<SignalLevel, { label: string; color: string; bg: string; dot: string }> = {
  cold:    { label: "No Signal",  color: "var(--text-muted)",    bg: "rgba(255,255,255,0.04)", dot: "var(--border)" },
  warming: { label: "Warming",    color: "#f59e0b",              bg: "rgba(245,158,11,0.1)",  dot: "#f59e0b" },
  active:  { label: "Active",     color: "#3b82f6",              bg: "rgba(59,130,246,0.12)", dot: "#3b82f6" },
  hot:     { label: "Hot Signal", color: "#ef4444",              bg: "rgba(239,68,68,0.12)",  dot: "#ef4444" },
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
}: {
  scenario: MacroScenario;
  signal: ScenarioSignal | null;
  quotes: ScenarioQuote[];
  onTickerClick?: (ticker: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [quotesLoaded, setQuotesLoaded] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

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
            <span style={{
              fontSize: "9px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "2px 7px",
              borderRadius: "var(--radius-full)",
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.color}40`,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}>
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
              fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: "var(--green)", marginBottom: "8px",
            }}>
              Stocks to Own Beforehand
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {scenario.long.map((play) => {
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
                fontSize: "9px", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "var(--red)", marginBottom: "8px",
              }}>
                Likely to Underperform
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {scenario.avoid.map((play) => {
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
        </div>
      )}
    </div>
  );
}

// ─── ScenariosPanel ───────────────────────────────────────────────────────────

export default function ScenariosPanel({ onTickerClick }: { onTickerClick?: (ticker: string) => void }) {
  const [signals, setSignals] = useState<ScenarioSignal[]>([]);
  const [quotes, setQuotes] = useState<ScenarioQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const loadSignals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scenarios/signals");
      if (res.ok) setSignals(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  // Preload quotes for the top visible tickers when signals arrive
  useEffect(() => {
    if (!signals.length) return;
    const signalById = new Map(signals.map((s) => [s.scenarioId, s]));
    const sorted = [...MACRO_SCENARIOS].sort((a, b) => {
      const ca = signalById.get(a.id)?.count ?? 0;
      const cb = signalById.get(b.id)?.count ?? 0;
      return cb - ca;
    });
    const topTickers = sorted
      .slice(0, 5)
      .flatMap((s) => [...s.long, ...s.avoid].map((t) => t.ticker))
      .slice(0, 20)
      .join(",");
    if (!topTickers) return;
    fetch(`/api/scenarios/quotes?tickers=${topTickers}`)
      .then((r) => r.json())
      .then((data: ScenarioQuote[]) => setQuotes(data))
      .catch(() => {});
  }, [signals]);

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

  const filteredScenarios = MACRO_SCENARIOS.filter(
    (s) => activeCategory === "all" || s.category === activeCategory
  );

  const sorted = [...filteredScenarios].sort((a, b) => {
    const ca = signalById.get(a.id)?.count ?? 0;
    const cb = signalById.get(b.id)?.count ?? 0;
    return cb - ca;
  });

  const hotCount = signals.filter((s) => s.count >= 4).length;
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

        {/* Signal summary */}
        {!loading && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {hotCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 5px #ef4444" }} />
                <span style={{ fontSize: "10px", fontWeight: 700, color: "#ef4444" }}>
                  {hotCount} Hot
                </span>
              </div>
            )}
            {activeCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: "5px",
                padding: "4px 10px",
                borderRadius: "var(--radius-full)",
                background: "rgba(59,130,246,0.1)",
                border: "1px solid rgba(59,130,246,0.25)",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#3b82f6" }} />
                <span style={{ fontSize: "10px", fontWeight: 600, color: "#3b82f6" }}>
                  {activeCount} w/ Signals
                </span>
              </div>
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
              onClick={() => setActiveCategory(id)}
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
                const cnt = MACRO_SCENARIOS.filter((s) => s.category === id && (signalById.get(s.id)?.count ?? 0) > 0).length;
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
          {sorted.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              signal={signalById.get(scenario.id) ?? null}
              quotes={quotes}
              onTickerClick={onTickerClick}
            />
          ))}
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
