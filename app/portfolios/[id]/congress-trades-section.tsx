"use client";

import { useEffect, useState } from "react";

type CongressTrade = {
  ticker: string;
  representative: string;
  party: string;
  chamber: string;
  state: string;
  transaction: string;
  amount: string;
  transactionDate: string;
  reportDate: string;
};

type FilterSignal = "all" | "buy" | "sell";
type FilterChamber = "all" | "House" | "Senate";

function formatAmount(amount: string): string {
  if (!amount) return "";
  const clean = amount.replace(/\$/g, "").replace(/,/g, "").replace(/\s/g, "");
  const parts = clean.split("-").map((p) => {
    const n = parseInt(p.trim(), 10);
    if (isNaN(n)) return p.trim();
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
  });
  return parts.join("–");
}

function isSale(transaction: string): boolean {
  return /sale/i.test(transaction);
}

export default function CongressTradesSection({ tickers }: { tickers: string[] }) {
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSignal, setFilterSignal] = useState<FilterSignal>("all");
  const [filterChamber, setFilterChamber] = useState<FilterChamber>("all");

  useEffect(() => {
    if (tickers.length === 0) { setLoading(false); return; }
    setLoading(true);
    Promise.all(
      tickers.map((t) =>
        fetch(`/api/congress/${t}`)
          .then((r) => r.json())
          .then((d: { trades?: CongressTrade[] }) => d.trades ?? [])
          .catch(() => [] as CongressTrade[])
      )
    ).then((results) => {
      const all = (results as CongressTrade[][]).flat().sort(
        (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      );
      setTrades(all);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers.join(",")]);

  const filtered = trades.filter((t) => {
    if (filterSignal === "buy" && isSale(t.transaction)) return false;
    if (filterSignal === "sell" && !isSale(t.transaction)) return false;
    if (filterChamber !== "all" && t.chamber !== filterChamber) return false;
    return true;
  });

  const purchases = trades.filter((t) => !isSale(t.transaction)).length;
  const sales = trades.filter((t) => isSale(t.transaction)).length;
  const netSignal = purchases > sales ? "buy" : sales > purchases ? "sell" : "neutral";

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
        Loading congressional disclosures...
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>No recent congressional disclosures</div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>No STOCK Act filings found for current holdings</div>
      </div>
    );
  }

  return (
    <div>
      {/* Signal summary bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px",
        marginBottom: "16px", background: "var(--bg-surface)", border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-md)",
      }}>
        <div style={{
          padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
          fontFamily: "var(--font-mono)", letterSpacing: "0.04em",
          background: netSignal === "buy" ? "rgba(34,197,94,0.12)" : netSignal === "sell" ? "rgba(239,68,68,0.12)" : "var(--bg-elevated)",
          color: netSignal === "buy" ? "var(--green)" : netSignal === "sell" ? "var(--red)" : "var(--text-muted)",
        }}>
          {netSignal === "buy" ? "GOV▲" : netSignal === "sell" ? "GOV▼" : "GOV—"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: netSignal === "buy" ? "var(--green)" : netSignal === "sell" ? "var(--red)" : "var(--text-muted)" }}>
            {netSignal === "buy" ? "Net Buying" : netSignal === "sell" ? "Net Selling" : "Mixed Activity"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px" }}>
            {purchases > 0 && <span style={{ color: "var(--green)", marginRight: "10px" }}>{purchases} purchase{purchases !== 1 ? "s" : ""}</span>}
            {sales > 0 && <span style={{ color: "var(--red)" }}>{sales} sale{sales !== 1 ? "s" : ""}</span>}
          </div>
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{trades.length} total disclosures</div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
        {(["all", "buy", "sell"] as FilterSignal[]).map((f) => (
          <button key={f} onClick={() => setFilterSignal(f)} style={{
            padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 500,
            border: "1px solid", cursor: "pointer",
            borderColor: filterSignal === f ? "var(--brand-blue)" : "var(--border-subtle)",
            background: filterSignal === f ? "rgba(37,99,235,0.12)" : "transparent",
            color: filterSignal === f ? "var(--brand-blue)" : "var(--text-muted)",
          }}>
            {f === "all" ? "All" : f === "buy" ? "Purchases" : "Sales"}
          </button>
        ))}
        <div style={{ width: "1px", background: "var(--border-subtle)", margin: "0 2px" }} />
        {(["all", "House", "Senate"] as FilterChamber[]).map((f) => (
          <button key={f} onClick={() => setFilterChamber(f)} style={{
            padding: "4px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 500,
            border: "1px solid", cursor: "pointer",
            borderColor: filterChamber === f ? "var(--brand-blue)" : "var(--border-subtle)",
            background: filterChamber === f ? "rgba(37,99,235,0.12)" : "transparent",
            color: filterChamber === f ? "var(--brand-blue)" : "var(--text-muted)",
          }}>
            {f}
          </button>
        ))}
      </div>

      {/* Trades list */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {filtered.slice(0, 50).map((t, i) => {
          const sale = isSale(t.transaction);
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: "10px",
              padding: "10px 0",
              borderBottom: i < Math.min(filtered.length, 50) - 1 ? "1px solid var(--border-subtle)" : "none",
            }}>
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%", marginTop: "6px", flexShrink: 0,
                background: sale ? "var(--red)" : "var(--green)",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {t.ticker}
                  </span>
                  <span style={{
                    padding: "1px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: 600,
                    background: sale ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                    color: sale ? "var(--red)" : "var(--green)",
                  }}>
                    {sale ? "SALE" : "PURCHASE"}
                  </span>
                  <span style={{
                    padding: "1px 6px", borderRadius: "3px", fontSize: "10px",
                    background: "var(--bg-elevated)", color: "var(--text-muted)",
                  }}>
                    {t.chamber}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                  {t.representative}
                  {t.state && <span style={{ color: "var(--text-muted)" }}> · {t.state}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                  {formatAmount(t.amount)}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {t.transactionDate}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ padding: "20px 0", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
          No trades match the current filter.
        </div>
      )}

      <div style={{ marginTop: "14px", fontSize: "10px", color: "var(--text-muted)", lineHeight: 1.6 }}>
        STOCK Act requires members of Congress to disclose trades within 45 days of the transaction. Amounts are ranges, not exact figures.
      </div>
    </div>
  );
}
