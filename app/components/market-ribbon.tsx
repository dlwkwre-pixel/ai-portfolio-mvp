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

export default function MarketRibbon({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
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
      borderTop: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid var(--line-006)",
      borderBottom: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid var(--line-006)",
      padding: "9px 0",
      background: dark ? "oklch(0.22 0.03 150)" : "var(--surface-003)",
      position: "relative",
    }}>


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
            whiteSpace: "nowrap", color: "var(--text-tertiary)",
          }}>
            <span style={{ color: dark ? "oklch(0.85 0.02 150)" : "var(--text-tertiary)", fontWeight: 600 }}>{q.ticker}</span>
            {loading || q.price === 0 ? (
              <span style={{ color: dark ? "oklch(0.55 0.02 150)" : "var(--text-muted)" }}>—</span>
            ) : (
              <>
                <span style={{ color: dark ? "oklch(0.6 0.02 150)" : "var(--text-secondary)" }}>${fmt(q.price)}</span>
                <span style={{ color: q.isUp ? (dark ? "#4fd07f" : "var(--green)") : (dark ? "#f08a8a" : "var(--red)") }}>
                  {q.isUp ? "+" : ""}{fmt(q.changePct)}%
                </span>
              </>
            )}
          </div>
        ))}
      </div>
      {updatedAt && (
        <div style={{
          textAlign: "center",
          fontSize: "10px",
          color: dark ? "oklch(0.55 0.02 150)" : "var(--text-muted)",
          marginTop: "5px",
          letterSpacing: "0.05em",
        }}>
          Live · updated {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}
    </div>
  );
}
