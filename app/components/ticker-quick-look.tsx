"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type LookupContextValue = { open: (ticker: string) => void };
const LookupContext = createContext<LookupContextValue | null>(null);

export function useTickerLookup(): LookupContextValue {
  const ctx = useContext(LookupContext);
  // Graceful no-op fallback if used outside a provider
  return ctx ?? { open: () => {} };
}

function ResearchModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(2,6,16,0.74)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(8px, 3vw, 32px)",
        animation: "bt-fade-in 0.18s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "820px",
          height: "92vh",
          maxHeight: "92vh",
          background: "var(--bg-base, #040d1a)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
          animation: "bt-scale-in 0.22s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            padding: "11px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.02)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: 0 }}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="rgba(96,165,250,0.9)">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
              {ticker}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Research</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <Link
              href={`/research?ticker=${encodeURIComponent(ticker)}`}
              onClick={onClose}
              title="Open in full page"
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                fontSize: "11px", fontWeight: 600, color: "rgba(147,197,253,0.95)",
                textDecoration: "none", padding: "5px 10px", borderRadius: "var(--radius-sm)",
                background: "rgba(37,99,235,0.12)", border: "1px solid rgba(96,165,250,0.22)",
              }}
            >
              Full page
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </Link>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: "8px", width: "30px", height: "30px", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Iframe body */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          {!loaded && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", zIndex: 1 }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "rgba(96,165,250,0.6)", animation: "bt-pulse 1.2s ease-in-out infinite" }} />
              <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Loading {ticker} research...</span>
            </div>
          )}
          <iframe
            src={`/research?ticker=${encodeURIComponent(ticker)}&embed=1`}
            title={`${ticker} research`}
            onLoad={() => setLoaded(true)}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              opacity: loaded ? 1 : 0,
              transition: "opacity 0.25s ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function TickerLookupProvider({ children }: { children: React.ReactNode }) {
  const [ticker, setTicker] = useState<string | null>(null);
  const open = useCallback((t: string) => setTicker(t.trim().toUpperCase()), []);
  const close = useCallback(() => setTicker(null), []);

  return (
    <LookupContext.Provider value={{ open }}>
      {children}
      {ticker && <ResearchModal ticker={ticker} onClose={close} />}
    </LookupContext.Provider>
  );
}
