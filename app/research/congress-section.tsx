"use client";

import { useEffect, useState } from "react";

type Trade = {
  chamber: "house" | "senate";
  person: string;
  ticker: string;
  assetName: string;
  txType: "buy" | "sell" | "exchange";
  amountRange: string;
  amountMid: number;
  transactionDate: string;
  disclosureDate: string;
  ptrLink: string | null;
};
type TickerSummary = {
  ticker: string;
  buys: number;
  sells: number;
  net: number;
  tradeCount: number;
  notionalMid: number;
  people: string[];
  lastTraded: string;
};
type Activity = { trades: Trade[]; topTickers: TickerSummary[]; updatedAt: string };

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const fmtAmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1000)}K` : `$${Math.round(n)}`;

export default function CongressSection({
  active,
  onTickerClick,
}: {
  active: boolean;
  onTickerClick: (ticker: string) => void;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!active || fetched) return;
    setFetched(true);
    fetch("/api/research/congress")
      .then((r) => r.json())
      .then((d: Activity) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [active, fetched]);

  if (!active) return null;

  if (loading) {
    return (
      <div style={{ marginBottom: "28px" }}>
        <div className="bt-skeleton" style={{ width: "150px", height: "10px", borderRadius: "3px", marginBottom: "14px" }} />
        <div className="research-section-row">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bt-skeleton" style={{ width: "150px", height: "92px", borderRadius: "var(--radius-lg)", flexShrink: 0 }} />
          ))}
        </div>
      </div>
    );
  }

  // No data available — hide the section entirely rather than show an empty/"syncing" shell.
  if (!data || (data.topTickers.length === 0 && data.trades.length === 0)) return null;

  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          🏛️ Congress is Trading
        </div>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>STOCK Act disclosures · last {120} days</span>
      </div>
      <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.5 }}>
        Stocks most actively traded by U.S. House &amp; Senate members. Tap any ticker to research it.
      </p>

      {/* Most-traded tickers */}
      <div className="research-section-row" style={{ marginBottom: "16px" }}>
        {data.topTickers.slice(0, 12).map((s) => {
          const lean = s.net > 0 ? "buy" : s.net < 0 ? "sell" : "even";
          const leanColor = lean === "buy" ? "var(--green)" : lean === "sell" ? "#f87171" : "var(--text-tertiary)";
          return (
            <button
              key={s.ticker}
              type="button"
              onClick={() => onTickerClick(s.ticker)}
              style={{
                flexShrink: 0,
                width: "158px",
                textAlign: "left",
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-lg)",
                padding: "12px 13px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{s.ticker}</span>
                <span style={{ fontSize: "10px", fontWeight: 700, color: leanColor, fontFamily: "var(--font-mono)" }}>
                  {lean === "buy" ? `${s.buys}B` : lean === "sell" ? `${s.sells}S` : "—"}
                </span>
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: "3px" }}>
                {s.tradeCount} trade{s.tradeCount === 1 ? "" : "s"} · {fmtAmt(s.notionalMid)}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {s.people[0]}{s.people.length > 1 ? ` +${s.people.length - 1}` : ""}
              </div>
            </button>
          );
        })}
      </div>

      {/* Recent disclosures list */}
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
        {data.trades.slice(0, 10).map((t, i) => (
          <button
            key={`${t.ticker}-${t.person}-${i}`}
            type="button"
            onClick={() => onTickerClick(t.ticker)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 13px",
              background: "transparent",
              border: "none",
              borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span
              style={{
                flexShrink: 0,
                fontSize: "10px",
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "var(--font-mono)",
                color: t.txType === "buy" ? "var(--green)" : t.txType === "sell" ? "#f87171" : "var(--text-tertiary)",
                background: t.txType === "buy" ? "rgba(16,185,129,0.1)" : t.txType === "sell" ? "rgba(248,113,113,0.1)" : "var(--bg-elevated)",
                border: `1px solid ${t.txType === "buy" ? "rgba(16,185,129,0.2)" : t.txType === "sell" ? "rgba(248,113,113,0.2)" : "var(--border-subtle)"}`,
              }}
            >
              {t.txType === "buy" ? "BUY" : t.txType === "sell" ? "SELL" : "EXCH"}
            </span>
            <span style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-body)", width: "54px", flexShrink: 0 }}>{t.ticker}</span>
            <span style={{ flex: 1, fontSize: "11px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.person}
              <span style={{ color: "var(--text-muted)" }}> · {t.chamber === "house" ? "House" : "Senate"}</span>
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", flexShrink: 0, whiteSpace: "nowrap" }}>
              {t.amountRange ? fmtAmt(t.amountMid) : ""}
            </span>
            <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0, width: "48px", textAlign: "right" }}>
              {fmtDate(t.transactionDate)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Per-ticker congressional activity for a stock's research detail panel.
// Self-fetches /api/research/congress?ticker=X and shows recent House/Senate disclosures.
export function CongressTickerCard({ ticker }: { ticker: string }) {
  const [data, setData] = useState<{ summary: TickerSummary | null; trades: Trade[]; available: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/research/congress?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData({ summary: d.summary ?? null, trades: d.trades ?? [], available: !!d.available }); })
      .catch(() => { if (alive) setData({ summary: null, trades: [], available: false }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [ticker]);

  // Hide entirely when the dataset is unavailable (vs. just no trades for this ticker), so
  // we don't imply "this stock has no congress trades" when really there's no data at all.
  if (!loading && (!data || !data.available)) return null;

  return (
    <>
      <div style={{ padding: "14px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>🏛️ Congress Trades</span>
        <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
      </div>
      <div style={{ padding: "8px 18px 14px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: "13px" }}>Loading congressional trades…</div>
        ) : !data || data.trades.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
            No U.S. House or Senate disclosures for {ticker} in the last ~6 months. Source: public STOCK Act filings.
          </div>
        ) : (
          <div>
            {data.summary && (
              <div style={{ display: "flex", gap: "14px", marginBottom: "10px", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                <span style={{ color: "var(--green)" }}>{data.summary.buys} buy{data.summary.buys === 1 ? "" : "s"}</span>
                <span style={{ color: "var(--red)" }}>{data.summary.sells} sell{data.summary.sells === 1 ? "" : "s"}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{data.summary.people.length} member{data.summary.people.length === 1 ? "" : "s"}</span>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {data.trades.slice(0, 8).map((t, i) => (
                <div key={`${t.person}-${i}`} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                  <span style={{
                    flexShrink: 0, fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", fontFamily: "var(--font-mono)",
                    color: t.txType === "buy" ? "var(--green)" : t.txType === "sell" ? "#f87171" : "var(--text-tertiary)",
                    background: t.txType === "buy" ? "rgba(16,185,129,0.1)" : t.txType === "sell" ? "rgba(248,113,113,0.1)" : "var(--bg-elevated)",
                    border: `1px solid ${t.txType === "buy" ? "rgba(16,185,129,0.2)" : t.txType === "sell" ? "rgba(248,113,113,0.2)" : "var(--border-subtle)"}`,
                  }}>
                    {t.txType === "buy" ? "BUY" : t.txType === "sell" ? "SELL" : "EXCH"}
                  </span>
                  <span style={{ flex: 1, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {t.person}<span style={{ color: "var(--text-muted)" }}> · {t.chamber === "house" ? "House" : "Senate"}</span>
                  </span>
                  <span style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "11px", flexShrink: 0, whiteSpace: "nowrap" }}>{t.amountRange ? fmtAmt(t.amountMid) : ""}</span>
                  <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "11px", flexShrink: 0 }}>{fmtDate(t.transactionDate)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
