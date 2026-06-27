"use client";

import { useState } from "react";

// Shared company-logo badge used everywhere a stock's research is shown (research detail,
// screener cards, the ticker quick-look). Uses the provided logo URL (Finnhub profile) when
// available, otherwise best-effort by ticker, and falls back to a clean colored monogram so
// it never shows a broken image.

const PALETTE = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626", "#db2777", "#4f46e5"];
function colorFor(ticker: string): string {
  let h = 0;
  for (const c of ticker) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export default function StockLogo({
  ticker,
  src,
  size = 34,
  radius = 8,
}: {
  ticker: string;
  src?: string | null;
  size?: number;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const sym = (ticker || "").toUpperCase();
  // Finnhub logo (passed in) is most reliable; otherwise try FMP's by-ticker image.
  const url = src || `https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`;

  if (failed || !sym) {
    return (
      <div
        aria-hidden
        style={{
          width: size, height: size, borderRadius: radius, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: colorFor(sym || "?"), color: "#fff", fontWeight: 700,
          fontSize: Math.round(size * 0.36), fontFamily: "var(--font-mono)", letterSpacing: "-0.02em",
        }}
      >
        {sym.slice(0, 2) || "?"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, objectFit: "contain", background: "#fff" }}
    />
  );
}
