"use client";

import { useEffect, useState } from "react";

type QuoteResult = {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  isUp: boolean;
};

// Fallback static data shown before first fetch
const FALLBACK: QuoteResult[] = [
  { ticker: "NVDA", price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "AAPL", price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "MSFT", price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "TSLA", price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "SPY",  price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "AMZN", price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "GOOGL",price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "META", price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "NFLX", price: 0, change: 0, changePct: 0, isUp: false },
  { ticker: "AMD",  price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "QQQ",  price: 0, change: 0, changePct: 0, isUp: true },
  { ticker: "AVGO", price: 0, change: 0, changePct: 0, isUp: true },
];

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MarketRibbon() {
  const [quotes, setQuotes] = useState<QuoteResult[]>(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function fetchQuotes() {
    try {
      const res = await fetch("/api/market/ribbon");
      if (!res.ok) return;
      const data = await res.json();
      if (data.quotes?.length > 0) {
        setQuotes(data.quotes);
        setUpdatedAt(data.updatedAt);
        setLoading(false);
      }
    } catch {
      // Keep showing fallback/last data on error
    }
  }

  useEffect(() => {
    fetchQuotes();
    // Refresh every 60 seconds
    const interval = setInterval(fetchQuotes, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Double the quotes for seamless loop
  const doubled = [...quotes, ...quotes];

  return (
    <div style={{
      overflow: "hidden",
      borderTop: "1px solid rgba(255,255,255,0.04)",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      padding: "9px 0",
      background: "rgba(255,255,255,0.01)",
      position: "relative",
    }}>
      {/* Updated at indicator */}
      {updatedAt && (
        <div style={{
          position: "absolute", right: "16px", top: "50%",
          transform: "translateY(-50%)", zIndex: 2,
          fontSize: "9px", color: "#1e293b",
          background: "#07090f", paddingLeft: "8px",
        }}>
          {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      <style>{`
        @keyframes ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          gap: 36px;
          width: max-content;
          animation: ticker-scroll 35s linear infinite;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      <div className="ticker-track">
        {doubled.map((q, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "8px",
            fontFamily: "'DM Mono', monospace", fontSize: "11px",
            whiteSpace: "nowrap", color: "#475569",
          }}>
            <span style={{ color: "#64748b", fontWeight: 500 }}>{q.ticker}</span>
            {loading || q.price === 0 ? (
              <span style={{ color: "#1e293b" }}>—</span>
            ) : (
              <>
                <span style={{ color: "#94a3b8" }}>${fmt(q.price)}</span>
                <span style={{ color: q.isUp ? "#00d395" : "#ff5c5c" }}>
                  {q.isUp ? "+" : ""}{fmt(q.changePct)}%
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
