"use client";

import { useState } from "react";
import Link from "next/link";

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

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function ShareCardClient({ pub }: { pub: PubPortfolio }) {
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
  const retColor = ret >= 0 ? "#4ade80" : "#f87171";
  const excessColor = excess != null ? (excess >= 0 ? "#4ade80" : "#f87171") : "#94a3b8";

  return (
    <div style={{
      minHeight: "100vh",
      background: "oklch(0.09 0.008 250)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px",
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {/* Card */}
      <div style={{
        width: "100%",
        maxWidth: "480px",
        background: "oklch(0.13 0.01 250)",
        border: "1px solid oklch(0.22 0.015 250)",
        borderRadius: "20px",
        overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Top bar */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid oklch(0.18 0.01 250)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#3b82f6" }}>
            BuyTune
          </span>
          <button
            onClick={copyLink}
            style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "5px 12px", borderRadius: "8px", border: "none",
              background: copied ? "rgba(74,222,128,0.12)" : "rgba(59,130,246,0.12)",
              color: copied ? "#4ade80" : "#93c5fd",
              fontSize: "12px", fontWeight: 500, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {copied ? (
              <><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 8l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> Copied</>
            ) : (
              <><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M6 3H3a1 1 0 00-1 1v9a1 1 0 001 1h9a1 1 0 001-1v-3M9 1h6v6M15 1L8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> Copy link</>
            )}
          </button>
        </div>

        {/* Portfolio name */}
        <div style={{ padding: "28px 24px 20px" }}>
          <div style={{ fontSize: "11px", color: "#475569", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>
            Portfolio performance
          </div>
          <h1 style={{
            fontFamily: "'Syne', system-ui, sans-serif",
            fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 800,
            color: "#f0f4ff", letterSpacing: "-0.5px",
            margin: 0, lineHeight: 1.2,
          }}>
            {pub.public_name}
          </h1>
          {pub.public_description && (
            <p style={{ fontSize: "13px", color: "#64748b", margin: "6px 0 0", lineHeight: 1.5 }}>
              {pub.public_description}
            </p>
          )}
        </div>

        {/* Stats */}
        {hasStats ? (
          <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Return vs benchmark */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{
                background: "oklch(0.16 0.012 250)",
                border: "1px solid oklch(0.22 0.015 250)",
                borderRadius: "12px", padding: "16px",
              }}>
                <div style={{ fontSize: "10px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
                  All-time return
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "28px", fontWeight: 600, color: retColor, letterSpacing: "-0.5px" }}>
                  {fmtPct(pub.return_pct_alltime)}
                </div>
              </div>
              {pub.benchmark_symbol && pub.benchmark_return_pct != null && (
                <div style={{
                  background: "oklch(0.16 0.012 250)",
                  border: "1px solid oklch(0.22 0.015 250)",
                  borderRadius: "12px", padding: "16px",
                }}>
                  <div style={{ fontSize: "10px", color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
                    {pub.benchmark_symbol}
                  </div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "28px", fontWeight: 600, color: "#94a3b8", letterSpacing: "-0.5px" }}>
                    {fmtPct(pub.benchmark_return_pct)}
                  </div>
                </div>
              )}
            </div>

            {/* Excess return */}
            {excess != null && (
              <div style={{
                padding: "12px 16px",
                background: excess >= 0 ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
                border: `1px solid ${excess >= 0 ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)"}`,
                borderRadius: "10px",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: excessColor, flexShrink: 0 }}>
                  {excess >= 0
                    ? <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    : <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  }
                </svg>
                <span style={{ fontSize: "13px", color: excessColor, fontWeight: 500 }}>
                  {fmtPct(excess)} vs {pub.benchmark_symbol ?? "market"} all time
                </span>
              </div>
            )}

            {/* Since date */}
            <div style={{ fontSize: "11px", color: "#334155", textAlign: "center" }}>
              Since {fmtDate(pub.created_at)}{pub.stats_updated_at ? ` · Updated ${fmtDate(pub.stats_updated_at)}` : ""}
            </div>
          </div>
        ) : (
          <div style={{ padding: "0 24px 28px" }}>
            <div style={{
              padding: "16px", borderRadius: "10px",
              background: "oklch(0.16 0.012 250)",
              border: "1px solid oklch(0.22 0.015 250)",
              fontSize: "13px", color: "#475569", textAlign: "center",
            }}>
              Performance stats will appear after the next portfolio sync.
            </div>
          </div>
        )}

        {/* CTA footer */}
        <div style={{
          borderTop: "1px solid oklch(0.18 0.01 250)",
          padding: "16px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
        }}>
          <span style={{ fontSize: "12px", color: "#334155" }}>
            Track your portfolio free
          </span>
          <Link
            href="/signup"
            style={{
              display: "inline-flex", alignItems: "center", gap: "5px",
              padding: "7px 14px", borderRadius: "8px",
              background: "var(--brand-blue, #2563eb)",
              color: "#fff", fontSize: "12px", fontWeight: 600,
              textDecoration: "none", transition: "opacity 0.15s",
            }}
          >
            Get started free
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </div>

      {/* Back link for logged-in users */}
      <p style={{ marginTop: "20px", fontSize: "12px", color: "#1e293b" }}>
        <Link href="/dashboard" style={{ color: "#334155", textDecoration: "none" }}>Back to BuyTune</Link>
      </p>
    </div>
  );
}
