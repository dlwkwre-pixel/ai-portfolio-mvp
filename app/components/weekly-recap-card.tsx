"use client";

import { useState, useEffect } from "react";
import { useTickerLookup } from "@/app/components/ticker-quick-look";

type Mover = {
  ticker: string;
  market_value: number;
  day_change_pct: number | null;
};

type RecapData = {
  narrative: string;
  week_start: string;
  current_value: number;
  week_return_pct: number | null;
  baseline_value: number | null;
  best: { ticker: string; change_pct: number } | null;
  worst: { ticker: string; change_pct: number } | null;
  top_movers: Mover[];
  txn_count: number;
  holdings_count: number;
};

function isSatOrSun(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function fmtValue(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

export default function WeeklyRecapCard() {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [show, setShow] = useState(false);
  const { open } = useTickerLookup();

  useEffect(() => {
    if (!isSatOrSun()) {
      setLoading(false);
      return;
    }
    setShow(true);
    // Stagger 1.5s after week-ahead to avoid simultaneous Gemini calls hitting rate limits
    const t = setTimeout(() => {
      fetch("/api/market/weekly-recap")
        .then((r) => r.json())
        .then((d) => {
          if (d?.narrative) setData(d);
          else setError(true);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  if (!show || error) return null;

  const ret = data?.week_return_pct;
  const retColor = ret == null ? "var(--text-primary)" : ret >= 0 ? "var(--green)" : "var(--red)";
  const retLabel = ret == null ? null : `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`;
  const accent = ret == null ? "rgba(96,165,250,0.85)" : ret >= 0 ? "rgba(74,222,128,0.85)" : "rgba(248,113,113,0.85)";
  const cardBg = ret == null ? "rgba(37,99,235,0.03)" : ret >= 0 ? "rgba(34,197,94,0.03)" : "rgba(239,68,68,0.03)";
  const cardBorder = ret == null ? "rgba(37,99,235,0.12)" : ret >= 0 ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)";

  return (
    <div
      style={{
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
        transition: "all 0.3s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: loading ? "0" : "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill={accent}>
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            This Week&apos;s Recap
          </span>
        </div>
        {retLabel && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600, color: retColor }}>
            {retLabel}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, animation: "bt-pulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Building your week-in-review...</span>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Value + context line */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.4px" }}>
              {fmtValue(data.current_value)}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
              {data.holdings_count} position{data.holdings_count === 1 ? "" : "s"}
              {data.txn_count > 0 && ` · ${data.txn_count} trade${data.txn_count === 1 ? "" : "s"} this week`}
            </span>
          </div>

          {/* Narrative */}
          <p style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--text-secondary)", marginBottom: data.top_movers.length > 0 ? "12px" : "0" }}>
            {data.narrative}
          </p>

          {/* Movers — clickable to research */}
          {data.top_movers.length > 0 && (
            <>
              <div style={{ height: "1px", background: "rgba(255,255,255,0.05)", marginBottom: "10px" }} />
              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "8px" }}>
                Positions — Tap to Research
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {data.top_movers.map((m) => {
                  const chg = m.day_change_pct;
                  const chgColor = chg == null ? "var(--text-tertiary)" : chg >= 0 ? "var(--green)" : "var(--red)";
                  const isBest = data.best?.ticker === m.ticker;
                  const isWorst = data.worst?.ticker === m.ticker;
                  return (
                    <button
                      type="button"
                      key={m.ticker}
                      onClick={() => open(m.ticker)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "5px 10px",
                        borderRadius: "var(--radius-md)",
                        background: "rgba(255,255,255,0.04)",
                        border: `1px solid ${isBest ? "rgba(34,197,94,0.25)" : isWorst ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.07)"}`,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {m.ticker}
                      </span>
                      <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{fmtValue(m.market_value)}</span>
                      {chg != null && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, color: chgColor }}>
                          {chg >= 0 ? "+" : ""}{chg.toFixed(1)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
