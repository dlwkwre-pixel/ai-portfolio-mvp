"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Quote = { c: number; d: number; dp: number; h: number; l: number; o: number; pc: number };
type Profile = { name: string; logo: string; weburl: string; marketCap: number | null; industry: string | null };
type Metrics = { peRatio: number | null; weekHigh52: number | null; weekLow52: number | null };
type PriceTarget = { targetMean: number; targetHigh: number; targetLow: number };
type Recommendation = { buy: number; hold: number; sell: number; strongBuy: number; strongSell: number; period: string };

type SearchResult = {
  ticker: string;
  quote: Quote | null;
  profile: Profile | null;
  metrics: Metrics | null;
  priceTarget: PriceTarget | null;
  recommendation: Recommendation | null;
};

type LookupContextValue = { open: (ticker: string) => void };
const LookupContext = createContext<LookupContextValue | null>(null);

export function useTickerLookup(): LookupContextValue {
  const ctx = useContext(LookupContext);
  // Graceful no-op fallback if used outside a provider
  return ctx ?? { open: () => {} };
}

function fmtMarketCap(n: number | null): string | null {
  if (n == null || n <= 0) return null;
  // Finnhub returns market cap in millions
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}T`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}B`;
  return `$${n.toFixed(0)}M`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "3px" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function QuickLookModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setData(null);
    fetch(`/api/research/search?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((d) => setData(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ticker]);

  const q = data?.quote;
  const chg = q?.dp ?? null;
  const chgColor = chg == null ? "var(--text-secondary)" : chg >= 0 ? "var(--green)" : "var(--red)";
  const name = data?.profile?.name ?? ticker;
  const marketCap = fmtMarketCap(data?.profile?.marketCap ?? null);

  const rec = data?.recommendation;
  const recTotal = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
  const bullPct = rec && recTotal > 0 ? Math.round(((rec.strongBuy + rec.buy) / recTotal) * 100) : null;

  const target = data?.priceTarget?.targetMean ?? null;
  const upside = target && q && q.c > 0 ? ((target - q.c) / q.c) * 100 : null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(2,6,16,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "bt-fade-in 0.15s ease-out",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "var(--bg-card, #0a1424)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "var(--radius-lg)",
          padding: "18px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          animation: "bt-scale-in 0.2s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            {data?.profile?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.profile.logo} alt="" width={32} height={32} style={{ borderRadius: "8px", flexShrink: 0, background: "#fff" }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {ticker}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "240px" }}>
                {name}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", color: "var(--text-secondary)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "24px 0", justifyContent: "center" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "rgba(96,165,250,0.6)", animation: "bt-pulse 1.2s ease-in-out infinite" }} />
            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Loading {ticker}...</span>
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: "12px", color: "var(--text-tertiary)" }}>
            Couldn&apos;t load data for {ticker}.
          </div>
        )}

        {data && !loading && q && (
          <>
            {/* Price */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "16px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
                ${q.c.toFixed(2)}
              </span>
              {chg != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 600, color: chgColor }}>
                  {chg >= 0 ? "+" : ""}{q.d.toFixed(2)} ({chg >= 0 ? "+" : ""}{chg.toFixed(2)}%)
                </span>
              )}
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px 10px", marginBottom: "16px" }}>
              <Stat label="Open" value={`$${q.o.toFixed(2)}`} />
              <Stat label="Prev Close" value={`$${q.pc.toFixed(2)}`} />
              <Stat label="Day Range" value={`${q.l.toFixed(0)}–${q.h.toFixed(0)}`} />
              {marketCap && <Stat label="Market Cap" value={marketCap} />}
              {data.metrics?.peRatio != null && <Stat label="P/E" value={data.metrics.peRatio.toFixed(1)} />}
              {data.metrics?.weekHigh52 != null && data.metrics?.weekLow52 != null && (
                <Stat label="52W Range" value={`${data.metrics.weekLow52.toFixed(0)}–${data.metrics.weekHigh52.toFixed(0)}`} />
              )}
            </div>

            {/* Analyst row */}
            {(bullPct != null || target != null) && (
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                {bullPct != null && (
                  <div style={{ flex: "1 1 0", minWidth: "120px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                      Analyst Sentiment
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: bullPct >= 60 ? "var(--green)" : bullPct >= 40 ? "#f59e0b" : "var(--red)" }}>
                      {bullPct}% Bullish
                    </div>
                  </div>
                )}
                {target != null && (
                  <div style={{ flex: "1 1 0", minWidth: "120px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "var(--radius-md)", padding: "10px 12px" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                      Price Target
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                      ${target.toFixed(2)}
                      {upside != null && (
                        <span style={{ fontSize: "11px", color: upside >= 0 ? "var(--green)" : "var(--red)", marginLeft: "5px" }}>
                          {upside >= 0 ? "+" : ""}{upside.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Full research link */}
        <Link
          href={`/research?ticker=${encodeURIComponent(ticker)}`}
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            width: "100%",
            padding: "10px",
            borderRadius: "var(--radius-md)",
            background: "rgba(37,99,235,0.14)",
            border: "1px solid rgba(96,165,250,0.25)",
            color: "rgba(147,197,253,0.95)",
            fontSize: "12px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open full research
          <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </Link>
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
      {ticker && <QuickLookModal ticker={ticker} onClose={close} />}
    </LookupContext.Provider>
  );
}
