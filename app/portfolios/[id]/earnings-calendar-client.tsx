"use client";

import { useState } from "react";
import type { EarningsRow } from "./earnings-calendar-section";

type NewsItem = {
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
};

type Recommendations = {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  period: string;
};

type PriceTarget = {
  targetMean: number;
  targetHigh: number;
  targetLow: number;
  targetMedian: number;
};

type DetailData = {
  news: NewsItem[];
  recommendations: Recommendations | null;
  priceTarget: PriceTarget | null;
};

type Props = {
  rows: EarningsRow[];
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekLabel(days: number): string {
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return "This Week";
  if (days <= 14) return "Next Week";
  return "Later";
}

function hourLabel(hour: string): string {
  if (hour === "bmo") return "BMO";
  if (hour === "amc") return "AMC";
  if (hour === "dmh") return "DMH";
  return "";
}

function formatRevenue(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M`;
  return `$${v.toLocaleString()}`;
}

function recConsensus(r: Recommendations): { label: string; color: string } {
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  if (total === 0) return { label: "—", color: "var(--text-muted)" };
  const bullish = r.strongBuy + r.buy;
  const bearish = r.sell + r.strongSell;
  const pct = bullish / total;
  if (pct >= 0.6) return { label: "Buy", color: "var(--green)" };
  if (pct >= 0.45) return { label: "Hold", color: "#f59e0b" };
  if (bearish / total >= 0.4) return { label: "Sell", color: "var(--red)" };
  return { label: "Mixed", color: "#60a5fa" };
}

export default function EarningsCalendarClient({ rows }: Props) {
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailData | "loading" | "error">>({});

  if (!rows.length) {
    return (
      <div className="bt-card">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="#a78bfa">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Upcoming Earnings</h2>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>No earnings scheduled in the next 30 days.</p>
      </div>
    );
  }

  async function fetchDetail(ticker: string) {
    if (detailCache[ticker]) {
      // Toggle off if already expanded
      setExpandedTicker((prev) => (prev === ticker ? null : ticker));
      return;
    }
    setExpandedTicker(ticker);
    setDetailCache((prev) => ({ ...prev, [ticker]: "loading" }));
    try {
      const res = await fetch(`/api/earnings/detail?ticker=${ticker}`);
      if (!res.ok) throw new Error("fetch failed");
      const data: DetailData = await res.json();
      setDetailCache((prev) => ({ ...prev, [ticker]: data }));
    } catch {
      setDetailCache((prev) => ({ ...prev, [ticker]: "error" }));
    }
  }

  // Group by week label
  const groups: { label: string; items: EarningsRow[] }[] = [];
  for (const item of rows) {
    const label = weekLabel(item.daysAway);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return (
    <div className="bt-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="#a78bfa">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Upcoming Earnings</h2>
        </div>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          tap to research
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {groups.map(({ label, items }) => (
          <div key={label}>
            <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              {label}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {items.map((e) => {
                const isUrgent = e.daysAway <= 2;
                const hourTag = hourLabel(e.hour);
                const isExpanded = expandedTicker === e.symbol;
                const detail = detailCache[e.symbol];

                return (
                  <div key={e.symbol + e.date}>
                    {/* Main row — clickable */}
                    <button
                      type="button"
                      onClick={() => fetchDetail(e.symbol)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "8px 10px",
                        background: isExpanded
                          ? "rgba(124,58,237,0.1)"
                          : isUrgent
                          ? "rgba(124,58,237,0.06)"
                          : "var(--bg-elevated)",
                        border: `1px solid ${isExpanded ? "rgba(124,58,237,0.35)" : isUrgent ? "rgba(124,58,237,0.2)" : "var(--border-subtle)"}`,
                        borderRadius: isExpanded ? "var(--radius-md) var(--radius-md) 0 0" : "var(--radius-md)",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "var(--font-body)",
                        transition: "var(--transition-base)",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: isUrgent || isExpanded ? "#a78bfa" : "var(--text-primary)", minWidth: "44px" }}>
                        {e.symbol}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)", flex: 1 }}>
                        {formatDate(e.date)}
                        {e.quarter > 0 && (
                          <span style={{ color: "var(--text-muted)", marginLeft: "6px" }}>Q{e.quarter}</span>
                        )}
                      </span>
                      {e.epsEstimate !== null && (
                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                          EPS est&nbsp;{Number(e.epsEstimate).toFixed(2)}
                        </span>
                      )}
                      {hourTag && (
                        <span style={{
                          fontSize: "10px", fontWeight: 600,
                          color: hourTag === "BMO" ? "#60a5fa" : hourTag === "AMC" ? "#f59e0b" : "var(--text-muted)",
                          background: hourTag === "BMO" ? "rgba(96,165,250,0.08)" : hourTag === "AMC" ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${hourTag === "BMO" ? "rgba(96,165,250,0.2)" : hourTag === "AMC" ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)"}`,
                          padding: "1px 6px", borderRadius: "var(--radius-sm)", letterSpacing: "0.04em",
                        }}>
                          {hourTag}
                        </span>
                      )}
                      <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: isUrgent || isExpanded ? "#a78bfa" : "var(--text-muted)", minWidth: "28px", textAlign: "right" }}>
                        {e.daysAway === 0 ? "today" : e.daysAway === 1 ? "tmrw" : `${e.daysAway}d`}
                      </span>
                      <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", transition: "transform 0.2s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>

                    {/* Expanded detail panel */}
                    {isExpanded && (
                      <div style={{
                        background: "rgba(124,58,237,0.04)",
                        border: "1px solid rgba(124,58,237,0.25)",
                        borderTop: "none",
                        borderRadius: "0 0 var(--radius-md) var(--radius-md)",
                        padding: "12px",
                      }}>
                        {detail === "loading" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" style={{ animation: "spin 1s linear infinite" }}>
                              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                            </svg>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Loading analyst data…</span>
                          </div>
                        )}

                        {detail === "error" && (
                          <p style={{ fontSize: "11px", color: "var(--red)" }}>Failed to load data. Try again.</p>
                        )}

                        {detail && detail !== "loading" && detail !== "error" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                            {/* Analyst consensus + price target */}
                            {(detail.recommendations || detail.priceTarget) && (
                              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                {detail.recommendations && (() => {
                                  const total = detail.recommendations.strongBuy + detail.recommendations.buy + detail.recommendations.hold + detail.recommendations.sell + detail.recommendations.strongSell;
                                  const consensus = recConsensus(detail.recommendations);
                                  return (
                                    <div style={{ flex: 1, minWidth: "160px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                                      <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                                        Analyst consensus
                                      </p>
                                      <p style={{ fontSize: "14px", fontWeight: 700, color: consensus.color, marginBottom: "8px" }}>
                                        {consensus.label}
                                      </p>
                                      {total > 0 && (
                                        <>
                                          {/* Rating bar */}
                                          <div style={{ display: "flex", height: "4px", borderRadius: "2px", overflow: "hidden", gap: "1px", marginBottom: "6px" }}>
                                            {detail.recommendations.strongBuy > 0 && <div style={{ flex: detail.recommendations.strongBuy, background: "var(--green)" }} />}
                                            {detail.recommendations.buy > 0 && <div style={{ flex: detail.recommendations.buy, background: "var(--green)" }} />}
                                            {detail.recommendations.hold > 0 && <div style={{ flex: detail.recommendations.hold, background: "#f59e0b" }} />}
                                            {detail.recommendations.sell > 0 && <div style={{ flex: detail.recommendations.sell, background: "var(--red)" }} />}
                                            {detail.recommendations.strongSell > 0 && <div style={{ flex: detail.recommendations.strongSell, background: "var(--red)" }} />}
                                          </div>
                                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                            <span style={{ color: "var(--green)" }}>SB{detail.recommendations.strongBuy} B{detail.recommendations.buy}</span>
                                            <span style={{ color: "#f59e0b" }}>H{detail.recommendations.hold}</span>
                                            <span style={{ color: "var(--red)" }}>S{detail.recommendations.sell} SS{detail.recommendations.strongSell}</span>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}

                                {detail.priceTarget && (
                                  <div style={{ flex: 1, minWidth: "160px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                                    <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                                      Analyst price target
                                    </p>
                                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#a78bfa", marginBottom: "4px" }}>
                                      ${detail.priceTarget.targetMean.toFixed(2)}
                                      <span style={{ fontSize: "10px", fontWeight: 400, color: "var(--text-muted)", marginLeft: "4px" }}>mean</span>
                                    </p>
                                    <p style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                      ${detail.priceTarget.targetLow.toFixed(2)} – ${detail.priceTarget.targetHigh.toFixed(2)}
                                    </p>
                                  </div>
                                )}

                                {e.epsEstimate !== null || e.revenueEstimate !== null ? (
                                  <div style={{ flex: 1, minWidth: "160px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                                    <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                                      Estimates · Q{e.quarter} {e.year}
                                    </p>
                                    {e.epsEstimate !== null && (
                                      <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                                        EPS <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>${e.epsEstimate.toFixed(2)}</strong>
                                      </p>
                                    )}
                                    {e.revenueEstimate !== null && (
                                      <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        Rev <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{formatRevenue(e.revenueEstimate)}</strong>
                                      </p>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            )}

                            {/* News */}
                            {detail.news.length > 0 && (
                              <div>
                                <p style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                                  Recent news
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {detail.news.map((n, i) => (
                                    <a
                                      key={i}
                                      href={n.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: "flex",
                                        alignItems: "flex-start",
                                        gap: "8px",
                                        padding: "8px 10px",
                                        background: "var(--bg-elevated)",
                                        border: "1px solid var(--border-subtle)",
                                        borderRadius: "var(--radius-md)",
                                        textDecoration: "none",
                                        transition: "var(--transition-base)",
                                      }}
                                    >
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: "11px", color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "2px" }}>
                                          {n.headline}
                                        </p>
                                        <p style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                                          {n.source} · {new Date(n.datetime * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                        </p>
                                      </div>
                                      <svg width="10" height="10" viewBox="0 0 20 20" fill="var(--text-muted)" style={{ flexShrink: 0, marginTop: "2px" }}>
                                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
                                      </svg>
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            {!detail.recommendations && !detail.priceTarget && detail.news.length === 0 && (
                              <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>No analyst data available for this ticker.</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
        BMO = before market open · AMC = after market close · Tap a row to research
      </p>
    </div>
  );
}
