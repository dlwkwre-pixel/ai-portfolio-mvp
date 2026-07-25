"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Preview = {
  ticker: string;
  companyName: string | null;
  price: number;
  changePct: number | null;
  marketCap: number | null;
  peRatio: number | null;
  weekHigh52: number | null;
  weekLow52: number | null;
  consensus: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null;
};

function fmtCap(n: number | null): string | null {
  if (n == null) return null;
  // Finnhub reports marketCap in millions.
  const usd = n * 1_000_000;
  if (usd >= 1_000_000_000_000) return `$${(usd / 1_000_000_000_000).toFixed(2)}T`;
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(0)}M`;
  return `$${usd.toLocaleString()}`;
}

function ConsensusBar({ c }: { c: NonNullable<Preview["consensus"]> }) {
  const buy = c.strongBuy + c.buy;
  const sell = c.sell + c.strongSell;
  const total = buy + c.hold + sell;
  if (total === 0) return null;
  const buyPct = (buy / total) * 100;
  const holdPct = (c.hold / total) * 100;
  const sellPct = (sell / total) * 100;
  return (
    <div>
      <div style={{ display: "flex", height: "7px", borderRadius: "4px", overflow: "hidden", background: "var(--surface-006)" }}>
        {buyPct > 0 && <div style={{ width: `${buyPct}%`, background: "var(--green)" }} />}
        {holdPct > 0 && <div style={{ width: `${holdPct}%`, background: "var(--amber)" }} />}
        {sellPct > 0 && <div style={{ width: `${sellPct}%`, background: "var(--red)" }} />}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "5px", fontFamily: "var(--font-mono)" }}>
        <span>{buy} Buy</span>
        <span>{c.hold} Hold</span>
        <span>{sell} Sell</span>
      </div>
    </div>
  );
}

export default function TickerPreviewModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // TickerChip mounts a fresh instance of this modal per open, so `ticker`
  // never changes across the component's lifetime — no need to reset state.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market/preview/${encodeURIComponent(ticker)}`)
      .then((r) => { if (!r.ok) throw new Error("fetch failed"); return r.json(); })
      .then((json) => { if (!cancelled) setData(json); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const up = (data?.changePct ?? 0) >= 0;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)", zIndex: 201,
        width: "min(340px, calc(100vw - 32px))",
        background: "var(--bg-elevated)", border: "1px solid var(--card-border)",
        borderRadius: "18px", boxShadow: "0 8px 40px rgba(0,0,0,0.35)", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", marginBottom: "14px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--text-primary)" }}>${ticker}</div>
              {data?.companyName && (
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.companyName}</div>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "18px", lineHeight: 1, padding: "2px" }}>×</button>
          </div>

          {loading && (
            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "10px 0" }}>Loading…</div>
          )}
          {!loading && error && (
            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "10px 0" }}>Couldn&apos;t load a preview for ${ticker}.</div>
          )}
          {!loading && !error && data && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "16px" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "26px", fontWeight: 700, color: "var(--text-primary)" }}>
                  ${data.price.toFixed(2)}
                </span>
                {data.changePct != null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: up ? "var(--green)" : "var(--red)" }}>
                    {up ? "+" : ""}{data.changePct.toFixed(2)}%
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: data.consensus ? "16px" : "6px" }}>
                {fmtCap(data.marketCap) && (
                  <Stat label="Market cap" value={fmtCap(data.marketCap)!} />
                )}
                {data.peRatio != null && (
                  <Stat label="P/E" value={data.peRatio.toFixed(1)} />
                )}
                {data.weekLow52 != null && data.weekHigh52 != null && (
                  <Stat label="52-week range" value={`$${data.weekLow52.toFixed(0)} – $${data.weekHigh52.toFixed(0)}`} span2 />
                )}
              </div>

              {data.consensus && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "9.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "6px" }}>Analyst consensus</div>
                  <ConsensusBar c={data.consensus} />
                </div>
              )}
            </>
          )}

          <Link href={`/research?ticker=${encodeURIComponent(ticker)}`} onClick={onClose}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", width: "100%", boxSizing: "border-box", padding: "10px 0", borderRadius: "10px", background: "var(--brand-gradient)", color: "#fff", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>
            Open full research →
          </Link>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div style={{ gridColumn: span2 ? "1 / -1" : undefined }}>
      <div style={{ fontSize: "9.5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}
