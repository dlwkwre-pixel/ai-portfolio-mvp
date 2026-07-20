"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BrandGlyph } from "@/app/components/brand-mark";

type Holding = {
  ticker: string;
  company_name: string | null;
  allocation_pct: number;
  is_cash: boolean;
  display_order: number;
};

type PubPortfolio = {
  id: string;
  public_name: string;
  public_description: string | null;
  return_pct_alltime: number | null;
  benchmark_symbol: string | null;
  benchmark_return_pct: number | null;
  stats_updated_at: string | null;
  last_synced_at: string | null;
  created_at: string;
};

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function useCountUp(target: number, duration = 1400): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

const BAR_COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981"];

export default function ShareCardClient({
  pub,
  holdings = [],
}: {
  pub: PubPortfolio;
  holdings?: Holding[];
}) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const hasStats = pub.return_pct_alltime != null;
  const ret = pub.return_pct_alltime ?? 0;
  const bench = pub.benchmark_return_pct ?? 0;
  const excess = hasStats && pub.benchmark_return_pct != null ? ret - bench : null;

  const retDisplayed = useCountUp(ret, 1400);
  const benchDisplayed = useCountUp(bench, 1600);

  const retColor = ret >= 0 ? "#4ade80" : "#f87171";
  const excessColor = excess != null ? (excess >= 0 ? "#4ade80" : "#f87171") : "#94a3b8";

  const cardShadow = !hasStats
    ? "0 32px 80px rgba(0,0,0,0.6)"
    : ret >= 5
    ? "0 0 0 1px rgba(74,222,128,0.18), 0 32px 80px rgba(0,0,0,0.6), 0 0 80px rgba(74,222,128,0.05)"
    : ret <= -5
    ? "0 0 0 1px rgba(248,113,113,0.18), 0 32px 80px rgba(0,0,0,0.6), 0 0 80px rgba(248,113,113,0.05)"
    : "0 0 0 1px rgba(59,130,246,0.15), 0 32px 80px rgba(0,0,0,0.6)";

  const topHoldings = holdings.filter((h) => !h.is_cash).slice(0, 5);
  const maxAlloc = topHoldings.length > 0 ? Math.max(...topHoldings.map((h) => h.allocation_pct)) : 100;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "oklch(0.09 0.008 250)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes barGrow {
          from { width: 0; }
          to   { width: var(--bar-w); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "oklch(0.12 0.011 250)",
          borderRadius: "22px",
          overflow: "hidden",
          boxShadow: cardShadow,
          animation: "fadeUp 0.45s ease-out both",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid oklch(0.17 0.01 250)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <div
              style={{
                width: "20px",
                height: "20px",
                background: "linear-gradient(135deg, #3fae4a, #0ea5a0)",
                borderRadius: "5px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <BrandGlyph size={10} strokeWidth={3.4} />
            </div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#3b82f6",
              }}
            >
              BuyTune
            </span>
          </div>
          <button
            onClick={copyLink}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "5px 12px",
              borderRadius: "8px",
              border: "none",
              background: copied ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.06)",
              color: copied ? "#4ade80" : "#94a3b8",
              fontSize: "11px",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {copied ? (
              <>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 1h6v6M15 1L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Copy link
              </>
            )}
          </button>
        </div>

        {/* Identity */}
        <div style={{ padding: "24px 24px 0" }}>
          <div
            style={{
              fontSize: "10px",
              color: "var(--text-tertiary)",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: "4px",
            }}
          >
            Portfolio Performance
          </div>
          <h1
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: "clamp(19px, 5vw, 25px)",
              fontWeight: 800,
              color: "#f0f4ff",
              letterSpacing: "-0.5px",
              margin: "0 0 4px",
              lineHeight: 1.2,
            }}
          >
            {pub.public_name}
          </h1>
          {pub.public_description && (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: "0", lineHeight: 1.5 }}>
              {pub.public_description}
            </p>
          )}
        </div>

        {/* Stats */}
        {hasStats ? (
          <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Return cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div
                style={{
                  background:
                    ret >= 0
                      ? "linear-gradient(145deg, rgba(74,222,128,0.07), oklch(0.15 0.013 250))"
                      : "linear-gradient(145deg, rgba(248,113,113,0.07), oklch(0.15 0.013 250))",
                  border: `1px solid ${ret >= 0 ? "rgba(74,222,128,0.14)" : "rgba(248,113,113,0.14)"}`,
                  borderRadius: "14px",
                  padding: "14px 16px",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-tertiary)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "8px",
                  }}
                >
                  All-time return
                </div>
                <div
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "clamp(24px, 6vw, 30px)",
                    fontWeight: 600,
                    color: retColor,
                    letterSpacing: "-0.8px",
                    lineHeight: 1,
                  }}
                >
                  {retDisplayed >= 0 ? "+" : ""}
                  {retDisplayed.toFixed(1)}%
                </div>
              </div>

              {pub.benchmark_symbol && pub.benchmark_return_pct != null ? (
                <div
                  style={{
                    background: "oklch(0.15 0.012 250)",
                    border: "1px solid oklch(0.2 0.012 250)",
                    borderRadius: "14px",
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "10px",
                      color: "var(--text-tertiary)",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "8px",
                    }}
                  >
                    {pub.benchmark_symbol}
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: "clamp(24px, 6vw, 30px)",
                      fontWeight: 600,
                      color: "var(--text-tertiary)",
                      letterSpacing: "-0.8px",
                      lineHeight: 1,
                    }}
                  >
                    {benchDisplayed >= 0 ? "+" : ""}
                    {benchDisplayed.toFixed(1)}%
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "oklch(0.15 0.012 250)",
                    border: "1px solid oklch(0.2 0.012 250)",
                    borderRadius: "14px",
                    padding: "14px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#334155", textAlign: "center", lineHeight: 1.4 }}>
                    Since
                    <br />
                    {fmtDate(pub.created_at)}
                  </div>
                </div>
              )}
            </div>

            {/* Alpha banner */}
            {excess != null && (
              <div
                style={{
                  padding: "10px 14px",
                  background:
                    excess >= 0 ? "rgba(74,222,128,0.07)" : "rgba(248,113,113,0.07)",
                  border: `1px solid ${excess >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`,
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                  vs {pub.benchmark_symbol ?? "market"} all-time
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: excessColor,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    {excess >= 0 ? (
                      <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    ) : (
                      <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                  </svg>
                  {fmtPct(excess)}
                </span>
              </div>
            )}

            {/* Top holdings */}
            {topHoldings.length > 0 && (
              <div
                style={{
                  background: "oklch(0.14 0.011 250)",
                  border: "1px solid oklch(0.19 0.012 250)",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  animation: "fadeIn 0.6s 0.2s ease-out both",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    color: "var(--text-tertiary)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    marginBottom: "12px",
                  }}
                >
                  Top Holdings
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                  {topHoldings.map((h, i) => (
                    <div key={h.ticker} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          fontSize: "10px",
                          fontWeight: 700,
                          fontFamily: "'DM Mono', monospace",
                          color: BAR_COLORS[i % BAR_COLORS.length],
                          flexShrink: 0,
                        }}
                      >
                        {h.ticker}
                      </div>
                      <div
                        style={{
                          flex: 1,
                          height: "5px",
                          background: "oklch(0.19 0.01 250)",
                          borderRadius: "3px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={
                            {
                              "--bar-w": `${(h.allocation_pct / maxAlloc) * 100}%`,
                              height: "100%",
                              background: BAR_COLORS[i % BAR_COLORS.length],
                              borderRadius: "3px",
                              animation: `barGrow 0.85s ${0.35 + i * 0.1}s ease-out both`,
                            } as React.CSSProperties
                          }
                        />
                      </div>
                      <div
                        style={{
                          width: "36px",
                          fontSize: "10px",
                          fontFamily: "'DM Mono', monospace",
                          color: "var(--text-tertiary)",
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {h.allocation_pct.toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamp */}
            {pub.stats_updated_at && (
              <div style={{ fontSize: "10px", color: "#1e3a5f", textAlign: "center" }}>
                Updated {fmtDate(pub.stats_updated_at)}
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "20px 24px" }}>
            <div
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: "oklch(0.15 0.012 250)",
                border: "1px solid oklch(0.2 0.012 250)",
                fontSize: "13px",
                color: "var(--text-tertiary)",
                textAlign: "center",
              }}
            >
              Performance stats will appear after the next portfolio sync.
            </div>
          </div>
        )}

        {/* CTA footer */}
        <div
          style={{
            borderTop: "1px solid oklch(0.17 0.01 250)",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#334155" }}>AI portfolio analytics, free</span>
          <Link
            href="/signup"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "7px 14px",
              borderRadius: "8px",
              background: "linear-gradient(135deg, #3fae4a, #0ea5a0)",
              color: "#fff",
              fontSize: "11px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Start free
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>

      <p style={{ marginTop: "16px", fontSize: "11px" }}>
        <Link href="/dashboard" style={{ color: "#2d4a6b", textDecoration: "none" }}>
          Back to BuyTune
        </Link>
      </p>
    </div>
  );
}
