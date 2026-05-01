"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type Portfolio = { id: string; name: string };

type Quote = { c: number; d: number; dp: number };

type SearchResult = {
  ticker: string;
  quote: Quote;
  profile: { name: string; logo: string; weburl: string } | null;
  recommendation: {
    buy: number; hold: number; sell: number;
    strongBuy: number; strongSell: number;
  } | null;
  priceTarget: { targetMean: number; targetHigh: number; targetLow: number } | null;
  news: { headline: string; source: string; url: string; datetime: number }[];
};

type ScreenerTicker = {
  ticker: string; name: string;
  price?: number; change?: number; changePct?: number;
  analystLabel?: "Buy" | "Hold" | "Sell" | null;
};

type ScreenerSection = {
  id: string; label: string; emoji: string; tickers: ScreenerTicker[];
};

type NewsItem = {
  id: number; headline: string; source: string; url: string; datetime: number;
};

type TrendingTicker = {
  ticker: string; company_name: string | null;
  event_count: number; top_signal: string; time_window: string;
};

type AIAnalysis = {
  bull_case: string; bear_case: string;
  key_catalysts: string; key_risks: string;
  takeaway: string; confidence: string; cached_at?: string;
};

type FilterId = "all" | "trending" | "momentum" | "dividend" | "defensive" | "growth" | "popular";
type DetailTab = "overview" | "news" | "ai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function analystLabel(rec: SearchResult["recommendation"]) {
  if (!rec) return null;
  const bullish = (rec.strongBuy ?? 0) + (rec.buy ?? 0);
  const bearish = (rec.strongSell ?? 0) + (rec.sell ?? 0);
  const neutral = rec.hold ?? 0;
  const total = bullish + bearish + neutral;
  if (total === 0) return null;
  if (bullish / total >= 0.5) return { label: "Buy", color: "var(--green)", bg: "var(--green-bg)" };
  if (bearish / total >= 0.4) return { label: "Sell", color: "var(--red)", bg: "var(--red-bg)" };
  return { label: "Hold", color: "var(--amber)", bg: "var(--amber-bg)" };
}

function formatPrice(p: number | undefined) {
  if (p == null || isNaN(p) || p === 0) return "—";
  return p >= 1000
    ? `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${p.toFixed(2)}`;
}

function timeAgo(unix: number) {
  if (!unix) return "";
  const diff = Date.now() / 1000 - unix;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type TrackEventType = "ticker_search" | "stock_card_click" | "stock_detail_view" | "ai_analysis_requested";

function trackEvent(ticker: string, eventType: TrackEventType) {
  fetch("/api/research/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, event_type: eventType }),
  }).catch(() => {});
}

const FILTER_CHIPS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trending", label: "🔥 Trending" },
  { id: "momentum", label: "📈 Momentum" },
  { id: "dividend", label: "💰 Dividend" },
  { id: "defensive", label: "🛡️ Defensive" },
  { id: "growth", label: "🚀 Growth" },
  { id: "popular", label: "⭐ Popular" },
];

const SECTION_COLORS: Record<string, string> = {
  trending: "var(--red)",
  momentum: "var(--brand-blue)",
  dividend: "var(--amber)",
  defensive: "var(--green)",
  growth: "var(--violet)",
  popular: "var(--violet)",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, padding: "5px 13px", borderRadius: "20px",
        fontSize: "12px", fontWeight: active ? 600 : 400,
        fontFamily: "var(--font-body)",
        border: `1px solid ${active ? "rgba(37,99,235,0.5)" : "var(--card-border)"}`,
        background: active ? "rgba(37,99,235,0.12)" : "var(--card-bg)",
        color: active ? "var(--nav-active-text)" : "var(--text-tertiary)",
        boxShadow: active ? "0 0 12px rgba(37,99,235,0.18)" : "none",
        cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function AnalystBadge({ rec }: { rec: SearchResult["recommendation"] }) {
  const r = analystLabel(rec);
  if (!r) return null;
  return (
    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: r.bg, color: r.color }}>
      {r.label}
    </span>
  );
}

function SectionHeader({ emoji, label, sectionId }: { emoji?: string; label: string; sectionId?: string }) {
  const accent = sectionId ? (SECTION_COLORS[sectionId] ?? "var(--brand-blue)") : "var(--brand-blue)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "10px", borderLeft: `2px solid ${accent}`, marginBottom: "12px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.1px" }}>
        {emoji && <span style={{ marginRight: "5px" }}>{emoji}</span>}
        {label}
      </div>
    </div>
  );
}

const ANALYST_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  Buy:  { color: "var(--green)",  bg: "var(--green-bg)",  border: "rgba(34,197,94,0.25)" },
  Hold: { color: "var(--amber)",  bg: "var(--amber-bg)",  border: "rgba(234,179,8,0.25)" },
  Sell: { color: "var(--red)",    bg: "var(--red-bg)",    border: "rgba(239,68,68,0.25)" },
};

function StockCard({ t, onClick }: { t: ScreenerTicker; onClick: (ticker: string) => void }) {
  const isUp = (t.changePct ?? 0) >= 0;
  const hasQuote = t.price != null && t.price !== 0;
  const rating = t.analystLabel ? ANALYST_STYLES[t.analystLabel] : null;
  return (
    <button
      onClick={() => onClick(t.ticker)}
      style={{
        flexShrink: 0, width: "156px", minHeight: "158px", padding: "12px 13px 13px",
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: "13px", textAlign: "left", cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex", flexDirection: "column",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)"; e.currentTarget.style.background = "var(--card-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.background = "var(--card-bg)"; }}
    >
      <span className="ticker" style={{ fontSize: "11px", padding: "2px 7px", marginBottom: "8px", display: "inline-block", alignSelf: "flex-start" }}>{t.ticker}</span>
      <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.35, marginBottom: "auto", paddingBottom: "10px" }}>{t.name}</div>
      {hasQuote ? (
        <div style={{ marginBottom: "10px" }}>
          <div className="num" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{formatPrice(t.price)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px" }}>
            <span style={{ display: "inline-block", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", ...(isUp ? { borderBottom: "5px solid var(--green)" } : { borderTop: "5px solid var(--red)" }) }} />
            <span className="num" style={{ fontSize: "11px", fontWeight: 500, color: isUp ? "var(--green)" : "var(--red)" }}>
              {isUp ? "+" : ""}{t.changePct?.toFixed(2)}%
            </span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px" }}>—</div>
      )}
      {rating ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 8px", borderRadius: "7px",
          background: rating.bg, border: `1px solid ${rating.border}`,
        }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: rating.color, letterSpacing: "0.02em" }}>
            {t.analystLabel}
          </span>
          <span style={{ fontSize: "9px", color: rating.color, opacity: 0.7, fontWeight: 500 }}>Analyst</span>
        </div>
      ) : (
        <div style={{ height: "24px" }} />
      )}
    </button>
  );
}

function TrendingCard({ t, onClick }: { t: TrendingTicker; onClick: (ticker: string) => void }) {
  return (
    <button
      onClick={() => onClick(t.ticker)}
      style={{
        flexShrink: 0, width: "152px", padding: "11px 12px",
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: "12px", textAlign: "left", cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        display: "flex", flexDirection: "column", gap: "5px",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(167,139,250,0.4)"; e.currentTarget.style.background = "var(--card-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--card-border)"; e.currentTarget.style.background = "var(--card-bg)"; }}
    >
      <span className="ticker" style={{ fontSize: "11px", padding: "2px 7px", display: "inline-block" }}>{t.ticker}</span>
      {t.company_name && <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3, height: "27px", overflow: "hidden" }}>{t.company_name}</div>}
      <span style={{ display: "inline-block", fontSize: "10px", fontWeight: 600, padding: "2px 7px", borderRadius: "4px", background: "var(--violet-bg)", color: "var(--violet)", marginTop: "2px" }}>
        {t.top_signal}
      </span>
      <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{t.time_window}</div>
    </button>
  );
}

// Compact horizontal news card (used in the top news strip)
function NewsHCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url} target="_blank" rel="noopener noreferrer"
      style={{
        flexShrink: 0, width: "220px", padding: "11px 13px",
        background: "var(--card-bg)", border: "1px solid var(--card-border)",
        borderRadius: "12px", textDecoration: "none",
        display: "flex", flexDirection: "column", gap: "6px",
        transition: "border-color 0.15s, background 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(37,99,235,0.35)"; (e.currentTarget as HTMLElement).style.background = "var(--card-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "var(--card-border)"; (e.currentTarget as HTMLElement).style.background = "var(--card-bg)"; }}
    >
      <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, overflow: "hidden", maxHeight: "3.36em" }}>
        {item.headline}
      </div>
      <div style={{ display: "flex", gap: "5px", fontSize: "10px", color: "var(--text-muted)", alignItems: "center", marginTop: "auto" }}>
        <span style={{ padding: "1px 5px", borderRadius: "3px", background: "var(--bg-surface)", color: "var(--text-tertiary)", fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {item.source}
        </span>
        <span>·</span>
        <span>{timeAgo(item.datetime)}</span>
      </div>
    </a>
  );
}

// ─── Buy Modal ────────────────────────────────────────────────────────────────

function BuyModal({
  ticker, companyName, currentPrice, portfolios, onClose,
}: {
  ticker: string; companyName: string; currentPrice: number;
  portfolios: Portfolio[]; onClose: () => void;
}) {
  const [portfolioId, setPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [shares, setShares] = useState("");
  const [pricePerShare, setPricePerShare] = useState(currentPrice > 0 ? currentPrice.toFixed(2) : "");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharesNum = parseFloat(shares) || 0;
  const priceNum = parseFloat(pricePerShare) || 0;
  const total = sharesNum * priceNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!portfolioId) { setError("Select a portfolio."); return; }
    if (sharesNum <= 0) { setError("Enter a valid number of shares."); return; }
    if (priceNum <= 0) { setError("Enter a valid cost basis."); return; }

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();

      // Check for existing holding
      const { data: existing } = await supabase
        .from("holdings")
        .select("id, shares, average_cost_basis")
        .eq("portfolio_id", portfolioId)
        .eq("ticker", ticker)
        .maybeSingle();

      if (existing) {
        const existingShares = Number(existing.shares);
        const existingAvg = Number(existing.average_cost_basis ?? priceNum);
        const newShares = existingShares + sharesNum;
        const newAvg = (existingShares * existingAvg + sharesNum * priceNum) / newShares;
        const { error: updateErr } = await supabase
          .from("holdings")
          .update({ shares: newShares, average_cost_basis: newAvg })
          .eq("id", existing.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase.from("holdings").insert({
          portfolio_id: portfolioId,
          ticker,
          company_name: companyName || ticker,
          asset_type: "stock",
          shares: sharesNum,
          average_cost_basis: priceNum,
        });
        if (insertErr) throw insertErr;
      }

      // Record the transaction
      await supabase.from("portfolio_transactions").insert({
        portfolio_id: portfolioId,
        transaction_type: "buy",
        ticker,
        quantity: sharesNum,
        price_per_share: priceNum,
        net_cash_impact: -(sharesNum * priceNum),
        traded_at: new Date().toISOString(),
      });

      setSuccess(true);
    } catch {
      setError("Failed to add to portfolio. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: "400px",
        background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
        borderRadius: "16px", overflow: "hidden",
        boxShadow: "var(--shadow-lg)",
      }}>
        {/* Modal header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(124,58,237,0.03))",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
              <span className="ticker" style={{ fontSize: "11px", padding: "2px 8px" }}>{ticker}</span>
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              Buy {companyName || ticker}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", display: "flex" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {success ? (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
              Added to portfolio
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
              {sharesNum} share{sharesNum !== 1 ? "s" : ""} of {ticker} at {formatPrice(priceNum)}
            </div>
            <button
              onClick={onClose}
              style={{
                padding: "8px 20px", background: "var(--brand-gradient)",
                border: "none", borderRadius: "9px",
                color: "#fff", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-body)",
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Portfolio selector */}
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                Portfolio
              </label>
              {portfolios.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No active portfolios found.</div>
              ) : (
                <select
                  value={portfolioId}
                  onChange={(e) => setPortfolioId(e.target.value)}
                  style={{
                    width: "100%", padding: "9px 12px",
                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                    borderRadius: "9px", color: "var(--text-primary)",
                    fontSize: "13px", outline: "none",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Shares */}
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                Shares
              </label>
              <input
                type="number" step="0.000001" min="0.000001"
                placeholder="10"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px",
                  background: "var(--card-bg)", border: "1px solid var(--card-border)",
                  borderRadius: "9px", color: "var(--text-primary)",
                  fontSize: "13px", fontFamily: "var(--font-mono)", outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(37,99,235,0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--card-border)")}
              />
            </div>

            {/* Cost basis */}
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
                Cost Basis / Share
              </label>
              <input
                type="number" step="0.000001" min="0.000001"
                placeholder="0.00"
                value={pricePerShare}
                onChange={(e) => setPricePerShare(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px",
                  background: "var(--card-bg)", border: "1px solid var(--card-border)",
                  borderRadius: "9px", color: "var(--text-primary)",
                  fontSize: "13px", fontFamily: "var(--font-mono)", outline: "none",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(37,99,235,0.5)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--card-border)")}
              />
            </div>

            {/* Total */}
            {total > 0 && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px", background: "rgba(37,99,235,0.06)",
                border: "1px solid rgba(37,99,235,0.15)", borderRadius: "9px",
              }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Total cost</span>
                <span className="num" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {formatPrice(total)}
                </span>
              </div>
            )}

            {error && (
              <div style={{ padding: "9px 12px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "8px", fontSize: "12px", color: "var(--red)" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", paddingTop: "2px" }}>
              <button
                type="submit"
                disabled={submitting || portfolios.length === 0}
                style={{
                  flex: 1, padding: "10px",
                  background: "var(--brand-gradient)",
                  border: "none", borderRadius: "9px",
                  color: "#fff", fontSize: "13px", fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  fontFamily: "var(--font-body)",
                  transition: "opacity 0.15s",
                }}
              >
                {submitting ? "Adding..." : "Add to Portfolio"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "10px 16px", background: "none",
                  border: "1px solid var(--card-border)", borderRadius: "9px",
                  color: "var(--text-muted)", fontSize: "13px",
                  cursor: "pointer", fontFamily: "var(--font-body)",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({
  result, portfolios, onClose,
}: {
  result: SearchResult; portfolios: Portfolio[]; onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCooldown, setAiCooldown] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  const rating = analystLabel(result.recommendation);
  const upside =
    result.priceTarget?.targetMean && result.quote.c > 0
      ? ((result.priceTarget.targetMean - result.quote.c) / result.quote.c) * 100
      : null;
  const isUp = result.quote.dp >= 0;

  function requestAI() {
    if (aiLoading || aiCooldown) return;
    setAiLoading(true);
    setAiError(null);
    trackEvent(result.ticker, "ai_analysis_requested");
    fetch("/api/research/ai-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: result.ticker, company_name: result.profile?.name ?? result.ticker, price: result.quote.c, change_pct: result.quote.dp }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setAiAnalysis(d);
        setAiCooldown(true);
        setTimeout(() => setAiCooldown(false), 60_000);
      })
      .catch((err) => setAiError(err.message ?? "Analysis failed. Try again later."))
      .finally(() => setAiLoading(false));
  }

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "news", label: result.news.length > 0 ? `News (${result.news.length})` : "News" },
    { id: "ai", label: "AI Analysis" },
  ];

  return (
    <>
      {buyOpen && (
        <BuyModal
          ticker={result.ticker}
          companyName={result.profile?.name ?? result.ticker}
          currentPrice={result.quote.c}
          portfolios={portfolios}
          onClose={() => setBuyOpen(false)}
        />
      )}

      <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", marginBottom: "24px", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
            <button
              onClick={onClose} title="Close"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "26px", height: "26px", flexShrink: 0, background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "7px", cursor: "pointer", color: "var(--text-tertiary)", transition: "color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
            >
              <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
                <span className="ticker" style={{ fontSize: "11px", padding: "2px 8px" }}>{result.ticker}</span>
                <AnalystBadge rec={result.recommendation} />
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", letterSpacing: "-0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {result.profile?.name || result.ticker}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <div style={{ textAlign: "right" }}>
              <div className="num" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{formatPrice(result.quote.c)}</div>
              <div className="num" style={{ fontSize: "12px", color: isUp ? "var(--green)" : "var(--red)", marginTop: "3px" }}>
                {isUp ? "+" : ""}{result.quote.d.toFixed(2)} ({isUp ? "+" : ""}{result.quote.dp.toFixed(2)}%)
              </div>
            </div>
            <button
              onClick={() => setBuyOpen(true)}
              style={{
                padding: "8px 18px", background: "var(--brand-gradient)",
                border: "none", borderRadius: "9px",
                color: "#fff", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-body)",
                boxShadow: "0 2px 12px rgba(37,99,235,0.3)",
                transition: "box-shadow 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 20px rgba(37,99,235,0.5)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(37,99,235,0.3)")}
            >
              Buy
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid var(--border-subtle)", padding: "0 18px" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "9px 12px", fontSize: "12px",
                fontWeight: tab === t.id ? 600 : 400,
                fontFamily: "var(--font-body)",
                background: "none", border: "none",
                borderBottom: `2px solid ${tab === t.id ? "var(--brand-blue)" : "transparent"}`,
                color: tab === t.id ? "var(--text-primary)" : "var(--text-tertiary)",
                cursor: "pointer", whiteSpace: "nowrap",
                transition: "color 0.15s", marginBottom: "-1px",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === "overview" && (
          <div style={{ padding: "16px 18px" }}>
            {(result.recommendation || result.priceTarget) ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                {result.recommendation && (() => {
                  const rec = result.recommendation!;
                  const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
                  const bullPct = total > 0 ? ((rec.strongBuy + rec.buy) / total) * 100 : 0;
                  const holdPct = total > 0 ? (rec.hold / total) * 100 : 0;
                  const bearPct = total > 0 ? ((rec.strongSell + rec.sell) / total) * 100 : 0;
                  return (
                    <div>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Analyst Ratings</div>
                      <div style={{ display: "flex", gap: "3px", height: "5px", borderRadius: "3px", overflow: "hidden", marginBottom: "8px" }}>
                        <div style={{ width: `${bullPct}%`, background: "var(--green)", flexShrink: 0 }} />
                        <div style={{ width: `${holdPct}%`, background: "var(--amber)", flexShrink: 0 }} />
                        <div style={{ width: `${bearPct}%`, background: "var(--red)", flexShrink: 0 }} />
                      </div>
                      <div style={{ display: "flex", gap: "12px", fontSize: "11px" }}>
                        <span style={{ color: "var(--green)" }}>Buy {rec.strongBuy + rec.buy}</span>
                        <span style={{ color: "var(--amber)" }}>Hold {rec.hold}</span>
                        <span style={{ color: "var(--red)" }}>Sell {rec.strongSell + rec.sell}</span>
                      </div>
                    </div>
                  );
                })()}
                {result.priceTarget && (
                  <div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Price Target</div>
                    <div className="num" style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-primary)" }}>{formatPrice(result.priceTarget.targetMean)}</div>
                    {upside !== null && (
                      <div className="num" style={{ fontSize: "11px", color: upside >= 0 ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
                        {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% upside
                      </div>
                    )}
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>
                      {formatPrice(result.priceTarget.targetLow)} – {formatPrice(result.priceTarget.targetHigh)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No analyst data available.</div>
            )}
          </div>
        )}

        {/* News */}
        {tab === "news" && (
          <div>
            {result.news.length === 0 ? (
              <div style={{ padding: "18px", fontSize: "13px", color: "var(--text-muted)" }}>No recent news found.</div>
            ) : (
              result.news.slice(0, 6).map((item, i) => (
                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", padding: "12px 18px", borderBottom: i < 5 ? "1px solid var(--border-subtle)" : "none", textDecoration: "none", transition: "background 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "4px" }}>{item.headline}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{item.source} · {timeAgo(item.datetime)}</div>
                </a>
              ))
            )}
          </div>
        )}

        {/* AI Analysis */}
        {tab === "ai" && (
          <div style={{ padding: "16px 18px" }}>
            {!aiAnalysis && !aiLoading && (
              <div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "14px" }}>
                  Get a concise AI-powered breakdown of {result.ticker} — bull case, bear case, key catalysts, and investor takeaway.
                </div>
                <button
                  onClick={requestAI} disabled={aiCooldown}
                  style={{ padding: "8px 18px", background: "var(--brand-gradient)", border: "none", borderRadius: "9px", color: "#fff", fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-body)", cursor: aiCooldown ? "not-allowed" : "pointer", opacity: aiCooldown ? 0.5 : 1, transition: "opacity 0.15s" }}
                >
                  Generate AI Analysis
                </button>
                {aiError && <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--red)" }}>{aiError}</div>}
              </div>
            )}
            {aiLoading && <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Analyzing {result.ticker}...</div>}
            {aiAnalysis && !aiLoading && (
              <div>
                {aiAnalysis.cached_at && (
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "14px" }}>
                    Generated {new Date(aiAnalysis.cached_at).toLocaleDateString()} · Confidence: <strong>{aiAnalysis.confidence}</strong>
                  </div>
                )}
                {([ { key: "bull_case", label: "Bull Case", color: "var(--green)" }, { key: "bear_case", label: "Bear Case", color: "var(--red)" }, { key: "key_catalysts", label: "Key Catalysts", color: "var(--brand-blue)" }, { key: "key_risks", label: "Key Risks", color: "var(--amber)" }, { key: "takeaway", label: "Investor Takeaway", color: "var(--violet)" } ] as const).map(({ key, label, color }) => (
                  <div key={key} style={{ marginBottom: "12px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color, marginBottom: "4px" }}>{label}</div>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{aiAnalysis[key]}</div>
                  </div>
                ))}
                <button onClick={() => { setAiAnalysis(null); setAiError(null); }}
                  style={{ marginTop: "4px", padding: "5px 12px", background: "none", border: "1px solid var(--card-border)", borderRadius: "7px", color: "var(--text-muted)", fontSize: "11px", cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  Regenerate
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResearchClient({ portfolios }: { portfolios: Portfolio[] }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [screener, setScreener] = useState<ScreenerSection[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(true);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  const [trending, setTrending] = useState<TrendingTicker[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingHasData, setTrendingHasData] = useState(false);

  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  const topRef = useRef<HTMLDivElement>(null);
  const inflightRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/research/screener")
      .then((r) => r.json()).then((d) => setScreener(d.sections ?? [])).catch(() => {}).finally(() => setScreenerLoading(false));
    fetch("/api/research/news")
      .then((r) => r.json()).then((d) => setNews(d.news ?? [])).catch(() => {}).finally(() => setNewsLoading(false));
    fetch("/api/research/trending")
      .then((r) => r.json()).then((d) => { setTrending(d.trending ?? []); setTrendingHasData(d.has_data ?? false); }).catch(() => {}).finally(() => setTrendingLoading(false));
  }, []);

  function doSearch(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t || inflightRef.current === t) return;
    inflightRef.current = t;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
    trackEvent(t, "ticker_search");
    fetch(`/api/research/search?ticker=${encodeURIComponent(t)}`)
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((d) => { setSearchResult(d); trackEvent(t, "stock_detail_view"); })
      .catch(() => setSearchError(`No data found for "${t}"`))
      .finally(() => { setSearching(false); inflightRef.current = null; });
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); doSearch(query); }
  function clearSearch() { setQuery(""); setSearchResult(null); setSearchError(null); }

  const nameMap = new Map<string, string>();
  for (const section of screener) for (const t of section.tickers) nameMap.set(t.ticker, t.name);

  const showPopular = activeFilter === "all" || activeFilter === "popular";
  const screenerSections = activeFilter === "popular" ? [] : activeFilter === "all" ? screener : screener.filter((s) => s.id === activeFilter);

  return (
    <div ref={topRef} style={{ maxWidth: "900px" }}>

      {/* Search */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "10px" }}>
        <div style={{ position: "relative" }}>
          <svg style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="Search ticker — AAPL, TSLA, NVDA..."
            style={{ width: "100%", padding: "12px 44px 12px 40px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "12px", color: "var(--text-primary)", fontSize: "14px", fontFamily: "var(--font-mono)", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(37,99,235,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--card-border)")}
          />
          {query && (
            <button type="button" onClick={clearSearch} style={{ position: "absolute", right: "13px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "4px", display: "flex", alignItems: "center" }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          )}
        </div>
      </form>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "16px" }}>
        {FILTER_CHIPS.map((chip) => (
          <FilterChip key={chip.id} label={chip.label} active={activeFilter === chip.id} onClick={() => setActiveFilter(chip.id)} />
        ))}
      </div>

      {/* Feedback */}
      {searching && <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>Loading {query}...</div>}
      {searchError && (
        <div style={{ padding: "11px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "10px", color: "var(--red)", fontSize: "13px", marginBottom: "18px" }}>
          {searchError}
        </div>
      )}

      {/* Detail view */}
      {searchResult && !searching && (
        <DetailView result={searchResult} portfolios={portfolios} onClose={clearSearch} />
      )}

      {/* Market News — horizontal strip */}
      <div style={{ marginBottom: "28px" }}>
        <SectionHeader emoji="📰" label="Market News" sectionId="momentum" />
        {newsLoading ? (
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>
        ) : news.length === 0 ? (
          <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>No news available.</div>
        ) : (
          <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "6px" }}>
            {news.map((item) => <NewsHCard key={item.id} item={item} />)}
          </div>
        )}
      </div>

      {/* Popular on BuyTune */}
      {showPopular && (
        <div style={{ marginBottom: "26px" }}>
          <SectionHeader emoji="⭐" label="Popular on BuyTune" sectionId="popular" />
          {trendingLoading ? (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading...</div>
          ) : !trendingHasData || trending.length === 0 ? (
            <div style={{ padding: "13px 15px", background: "var(--card-bg)", border: "1px dashed var(--card-border)", borderRadius: "11px", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5 }}>
              Popularity signals will appear as BuyTune activity grows.
            </div>
          ) : (
            <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "6px" }}>
              {trending.map((t) => (
                <TrendingCard key={t.ticker} t={{ ...t, company_name: t.company_name ?? nameMap.get(t.ticker) ?? null }}
                  onClick={(ticker) => { setQuery(ticker); doSearch(ticker); }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Screener sections */}
      {screenerLoading ? (
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading market data...</div>
      ) : (
        screenerSections.map((section) => (
          <div key={section.id} style={{ marginBottom: "26px" }}>
            <SectionHeader emoji={section.emoji} label={section.label} sectionId={section.id} />
            <div style={{ display: "flex", gap: "10px", overflowX: "auto", paddingBottom: "6px" }}>
              {section.tickers.map((t) => (
                <StockCard key={t.ticker} t={t}
                  onClick={(ticker) => { setQuery(ticker); trackEvent(ticker, "stock_card_click"); doSearch(ticker); }} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
