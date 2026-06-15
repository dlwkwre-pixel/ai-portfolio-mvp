"use client";

import { useState, useEffect } from "react";

type RecapData = {
  narrative: string;
  week_return_pct: number | null;
  best_ticker: string | null;
  worst_ticker: string | null;
  week_start: string;
};

function isSatOrSun(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export default function WeeklyRecapCard() {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [show, setShow] = useState(false);

  // ALL hooks first — then conditional return below
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

  return (
    <div
      style={{
        background: "rgba(34,197,94,0.03)",
        border: "1px solid rgba(34,197,94,0.12)",
        borderRadius: "var(--radius-lg)",
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: loading ? "0" : "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="rgba(74,222,128,0.85)">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(74,222,128,0.85)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            This Week&apos;s Recap
          </span>
        </div>
        {retLabel && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: retColor }}>
            {retLabel}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(74,222,128,0.5)", animation: "bt-pulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Building your week-in-review...</span>
        </div>
      )}

      {data && !loading && (
        <>
          <p style={{ fontSize: "12px", lineHeight: 1.65, color: "var(--text-secondary)", marginBottom: "10px" }}>
            {data.narrative}
          </p>
          {(data.best_ticker || data.worst_ticker) && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {data.best_ticker && (
                <span style={{ fontSize: "10px", color: "var(--green)", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
                  Best: {data.best_ticker}
                </span>
              )}
              {data.worst_ticker && data.worst_ticker !== data.best_ticker && (
                <span style={{ fontSize: "10px", color: "var(--red)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
                  Lagged: {data.worst_ticker}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
