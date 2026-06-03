"use client";

import { useState, useEffect } from "react";

function formatCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `$${(abs / 1_000).toFixed(1)}k`;
  return `$${abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function DashboardHeaderClient({
  totalValue,
  totalDayChange,
}: {
  totalValue: number;
  totalDayChange: number;
}) {
  const [isPrivate, setIsPrivateState] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("bt-privacy-mode") === "true"; } catch { return false; }
  });

  // Sync when another component on the page changes privacy
  useEffect(() => {
    const onPrivacyChange = () => {
      try {
        setIsPrivateState(localStorage.getItem("bt-privacy-mode") === "true");
      } catch {}
    };
    window.addEventListener("bt-privacy-change", onPrivacyChange);
    return () => window.removeEventListener("bt-privacy-change", onPrivacyChange);
  }, []);

  function toggle() {
    setIsPrivateState(prev => {
      const next = !prev;
      try {
        localStorage.setItem("bt-privacy-mode", String(next));
        window.dispatchEvent(new CustomEvent("bt-privacy-change"));
      } catch {}
      return next;
    });
  }

  const hide = (v: string) => isPrivate ? "••••••" : v;
  const dayPos = totalDayChange >= 0;
  const dayPct = totalValue > 0 ? (totalDayChange / (totalValue - totalDayChange)) * 100 : 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      {/* Stats */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600,
          color: "var(--text-primary)", letterSpacing: "-0.3px",
        }}>
          {hide(formatMoney(totalValue))}
        </span>
        {totalDayChange !== 0 && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "11px",
            color: dayPos ? "var(--green)" : "var(--red)",
          }}>
            {isPrivate ? "•••" : `${dayPos ? "+" : ""}${formatCompact(totalDayChange)} (${dayPos ? "+" : ""}${dayPct.toFixed(2)}%)`}
          </span>
        )}
      </div>

      {/* Privacy toggle */}
      <button
        type="button"
        onClick={toggle}
        title={isPrivate ? "Show values" : "Hide values"}
        className="bt-btn bt-btn-ghost bt-btn-sm"
        style={{ gap: "5px", padding: "4px 8px" }}
      >
        {isPrivate ? (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd"/>
            <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd"/>
          </svg>
        )}
        <span className="hidden sm:inline">{isPrivate ? "Show" : "Hide"}</span>
      </button>
    </div>
  );
}
