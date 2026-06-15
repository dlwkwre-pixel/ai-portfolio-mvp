"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

type IndexQuote = { symbol: string; label: string; price: number | null; change_pct: number | null };
type EarningsItem = { symbol: string; date: string; hour: string | null };

type WeekAheadData = {
  volatility: string;
  lean: string;
  headline: string;
  key_events: string[];
  summary: string;
  indices: IndexQuote[];
  earnings: EarningsItem[];
  generated_at: string;
  data_fetched_at: string;
};

function VolatilityDots({ level }: { level: string }) {
  const filled =
    level === "Low" ? 1 : level === "Medium" ? 2 : level === "High" ? 3 : 4;
  return (
    <span style={{ display: "inline-flex", gap: "3px", alignItems: "center" }}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background:
              i <= filled
                ? level === "Low"
                  ? "var(--green)"
                  : level === "Medium"
                  ? "#f59e0b"
                  : "var(--red)"
                : "rgba(255,255,255,0.12)",
          }}
        />
      ))}
    </span>
  );
}

function LeanBadge({ lean }: { lean: string }) {
  const style =
    lean === "Bullish"
      ? { bg: "rgba(34,197,94,0.12)", color: "var(--green)" }
      : lean === "Bearish"
      ? { bg: "rgba(239,68,68,0.12)", color: "var(--red)" }
      : { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" };
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: style.bg,
        color: style.color,
        padding: "2px 8px",
        borderRadius: "var(--radius-full)",
      }}
    >
      {lean}
    </span>
  );
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export default function WeekAheadCard() {
  const [data, setData] = useState<WeekAheadData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/market/week-ahead")
      .then((r) => r.json())
      .then((d) => {
        if (d?.headline) setData(d);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  if (error) return null;

  return (
    <div
      style={{
        background: "rgba(37,99,235,0.03)",
        border: "1px solid rgba(37,99,235,0.12)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: loading ? "0" : "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="rgba(96,165,250,0.9)">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(96,165,250,0.9)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Week Ahead
          </span>
        </div>
        {data && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <LeanBadge lean={data.lean} />
            <VolatilityDots level={data.volatility} />
          </div>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(96,165,250,0.5)", animation: "bt-pulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Analyzing this week&apos;s market setup...</span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Market snapshot strip */}
          {data.indices?.some((i) => i.price != null) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "6px",
                marginBottom: "12px",
              }}
            >
              {data.indices.map((idx) => {
                const chg = idx.change_pct;
                const chgColor = chg == null ? "var(--text-tertiary)" : chg >= 0 ? "var(--green)" : "var(--red)";
                return (
                  <div
                    key={idx.symbol}
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: "var(--radius-md)",
                      padding: "7px 8px",
                    }}
                  >
                    <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                      {idx.label}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.1 }}>
                      {idx.price != null ? idx.price.toFixed(2) : "—"}
                    </div>
                    {chg != null && (
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600, color: chgColor, marginTop: "1px" }}>
                        {chg >= 0 ? "+" : ""}{chg.toFixed(2)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Headline */}
          <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.45, marginBottom: "10px" }}>
            {data.headline}
          </p>

          {/* Key events row */}
          {data.key_events?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
              {data.key_events.map((evt, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: "10px",
                    color: "var(--text-secondary)",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  {evt}
                </span>
              ))}
            </div>
          )}

          {/* Earnings this week — clickable to research */}
          {data.earnings?.length > 0 && (
            <div style={{ marginBottom: "10px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>
                Notable Earnings
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {data.earnings.map((e) => (
                  <Link
                    key={`${e.symbol}-${e.date}`}
                    href={`/research?q=${e.symbol}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 9px",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(96,165,250,0.06)",
                      border: "1px solid rgba(96,165,250,0.15)",
                      textDecoration: "none",
                    }}
                  >
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "rgba(147,197,253,0.95)" }}>
                      {e.symbol}
                    </span>
                    <span style={{ fontSize: "9px", color: "var(--text-tertiary)" }}>
                      {dayLabel(e.date)}{e.hour === "bmo" ? " AM" : e.hour === "amc" ? " PM" : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Expandable summary */}
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              color: "rgba(96,165,250,0.8)",
              fontWeight: 500,
            }}
          >
            {expanded ? "Hide" : "Read"} analyst summary
            <svg
              width="9"
              height="9"
              viewBox="0 0 20 20"
              fill="currentColor"
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
            >
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {expanded && (
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, marginTop: "8px" }}>
              {data.summary}
            </p>
          )}

          {/* Footer */}
          <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
              {data.volatility} volatility expected
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>·</span>
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
              Updated {new Date(data.data_fetched_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
