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
  analystRec?: { buy: number; hold: number; sell: number } | null;
};

type ScreenerSection = {
  id: string; label: string; emoji: string; tickers: ScreenerTicker[];
};

type TrendingTicker = {
  ticker: string; company_name: string | null;
  holder_count: number;
};

type AIAnalysis = {
  bull_case: string; bear_case: string;
  key_catalysts: string; key_risks: string;
  takeaway: string; confidence: string; cached_at?: string;
};

type FilterId = "all" | "trending" | "daily_movers" | "growth" | "momentum" | "dividend" | "defensive" | "popular";
type DetailTab = "overview" | "news" | "ai" | "social";

type RedditPulse = {
  source?: "reddit" | "apewisdom";
  ticker: string; company_name: string; time_window: string;
  fetched_at: string; expires_at: string;
  post_count: number; mention_count: number;
  bullish_pct: number; bearish_pct: number; neutral_pct: number;
  sentiment_score: number; hype_score: number; conviction_score: number;
  reddit_pulse_score: number; sentiment_label: string;
  top_themes: string[]; top_bullish_themes: string[]; top_bearish_themes: string[];
  top_risks: string[]; top_catalysts: string[];
  subreddit_breakdown: { subreddit: string; post_count: number; sentiment: string; sentiment_label: string }[];
  source_post_links: { subreddit: string; title: string; score: number; comment_count: number; created_utc: number; permalink: string }[];
  summary: string; ai_powered: boolean; stale?: boolean;
  mentions?: number; mentions_24h_ago?: number; mention_change_pct?: number;
  upvotes?: number; rank?: number; rank_24h_ago?: number; rank_change?: number;
  reddit_trend_score?: number;
  status?: string; message?: string;
};

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
  { id: "all",          label: "All" },
  { id: "trending",     label: "Trending" },
  { id: "daily_movers", label: "Movers" },
  { id: "growth",       label: "Growth" },
  { id: "momentum",     label: "Momentum" },
  { id: "dividend",     label: "Dividend" },
  { id: "defensive",    label: "Defensive" },
  { id: "popular",      label: "Popular" },
];

const SECTION_COLORS: Record<string, string> = {
  trending:     "var(--red)",
  daily_movers: "var(--brand-blue)",
  growth:       "var(--violet)",
  momentum:     "var(--brand-blue)",
  dividend:     "var(--amber)",
  defensive:    "var(--green)",
  popular:      "var(--violet)",
};

// ─── Primitive components ─────────────────────────────────────────────────────

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: "5px 13px",
        borderRadius: "var(--radius-full)",
        fontSize: "12px",
        fontWeight: active ? 600 : 400,
        fontFamily: "var(--font-body)",
        border: `1px solid ${active ? "rgba(37,99,235,0.45)" : "var(--card-border)"}`,
        background: active ? "rgba(37,99,235,0.12)" : "transparent",
        color: active ? "#93c5fd" : "var(--text-tertiary)",
        boxShadow: active ? "0 0 0 1px rgba(37,99,235,0.1)" : "none",
        cursor: "pointer",
        transition: "color 150ms ease, background 150ms ease, border-color 150ms ease, box-shadow 150ms ease",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

function SectionHeader({ label, sectionId }: { label: string; sectionId?: string }) {
  const accent = sectionId ? (SECTION_COLORS[sectionId] ?? "var(--brand-blue)") : "var(--brand-blue)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "13px" }}>
      <div style={{
        width: "5px", height: "5px", borderRadius: "50%",
        background: accent, flexShrink: 0,
      }} />
      <span style={{
        fontSize: "10px", fontWeight: 700,
        color: "var(--text-secondary)",
        fontFamily: "var(--font-display)",
        letterSpacing: "0.07em",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="research-card-item" style={{
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      borderRadius: "var(--radius-lg)",
      padding: "12px 13px",
      minHeight: "156px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    }}>
      <div className="bt-skeleton" style={{ width: "44px", height: "18px", borderRadius: "var(--radius-sm)" }} />
      <div className="bt-skeleton" style={{ width: "80%", height: "11px", borderRadius: "3px" }} />
      <div className="bt-skeleton" style={{ width: "55%", height: "11px", borderRadius: "3px" }} />
      <div style={{ flex: 1 }} />
      <div className="bt-skeleton" style={{ width: "64px", height: "18px", borderRadius: "3px" }} />
      <div className="bt-skeleton" style={{ width: "48px", height: "10px", borderRadius: "3px" }} />
    </div>
  );
}

function AnalystBadge({ rec }: { rec: SearchResult["recommendation"] }) {
  const r = analystLabel(rec);
  if (!r) return null;
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700,
      padding: "2px 6px", borderRadius: "var(--radius-sm)",
      background: r.bg, color: r.color,
    }}>
      {r.label}
    </span>
  );
}

function AnalystBar({ rec }: { rec: ScreenerTicker["analystRec"] }) {
  if (!rec) return <div style={{ height: "30px" }} />;
  const total = rec.buy + rec.hold + rec.sell;
  if (total === 0) return <div style={{ height: "30px" }} />;
  const buyPct  = (rec.buy  / total) * 100;
  const holdPct = (rec.hold / total) * 100;
  const sellPct = (rec.sell / total) * 100;
  return (
    <div>
      <div style={{ display: "flex", gap: "2px", height: "4px", borderRadius: "2px", overflow: "hidden", marginBottom: "5px" }}>
        <div style={{ width: `${buyPct}%`,  background: "var(--green)", flexShrink: 0 }} />
        <div style={{ width: `${holdPct}%`, background: "var(--amber)", flexShrink: 0 }} />
        <div style={{ width: `${sellPct}%`, background: "var(--red)",   flexShrink: 0 }} />
      </div>
      <div style={{ display: "flex", gap: "7px", fontSize: "9px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
        <span style={{ color: "var(--green)" }}>B {rec.buy}</span>
        <span style={{ color: "var(--amber)" }}>H {rec.hold}</span>
        <span style={{ color: "var(--red)" }}>S {rec.sell}</span>
      </div>
    </div>
  );
}

// ─── Stock cards ──────────────────────────────────────────────────────────────

function StockCard({ t, onClick }: { t: ScreenerTicker; onClick: (ticker: string) => void }) {
  const isUp = (t.changePct ?? 0) >= 0;
  const hasQuote = t.price != null && t.price !== 0;
  return (
    <button
      className="research-card-item"
      onClick={() => onClick(t.ticker)}
      style={{
        padding: "12px 13px",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        minHeight: "156px",
        width: "100%",
        transition: "border-color 150ms ease, background 150ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(37,99,235,0.35)";
        e.currentTarget.style.background = "var(--card-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--card-border)";
        e.currentTarget.style.background = "var(--card-bg)";
        e.currentTarget.style.transform = "";
      }}
      onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
      onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
    >
      <span className="ticker" style={{ fontSize: "11px", padding: "2px 7px", marginBottom: "7px", display: "inline-block", alignSelf: "flex-start" }}>
        {t.ticker}
      </span>
      <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.35, flex: 1, marginBottom: "8px" }}>
        {t.name}
      </div>
      {hasQuote ? (
        <div style={{ marginBottom: "9px" }}>
          <div className="num" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
            {formatPrice(t.price)}
          </div>
          <div style={{ marginTop: "4px" }}>
            <span className="num" style={{ fontSize: "10px", fontWeight: 500, color: isUp ? "var(--green)" : "var(--red)" }}>
              {isUp ? "+" : ""}{t.changePct?.toFixed(2)}%
            </span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "9px" }}>—</div>
      )}
      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "8px" }}>
        <AnalystBar rec={t.analystRec} />
      </div>
    </button>
  );
}

function TrendingCard({ t, onClick }: { t: TrendingTicker; onClick: (ticker: string) => void }) {
  return (
    <button
      className="research-card-item"
      onClick={() => onClick(t.ticker)}
      style={{
        padding: "12px 13px",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-lg)",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        width: "100%",
        minHeight: "88px",
        transition: "border-color 150ms ease, background 150ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(124,58,237,0.35)";
        e.currentTarget.style.background = "var(--card-hover)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--card-border)";
        e.currentTarget.style.background = "var(--card-bg)";
        e.currentTarget.style.transform = "";
      }}
      onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
      onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
      onPointerCancel={(e) => { e.currentTarget.style.transform = ""; }}
    >
      <span className="ticker" style={{ fontSize: "11px", padding: "2px 7px", display: "inline-block", alignSelf: "flex-start" }}>
        {t.ticker}
      </span>
      {t.company_name && (
        <div style={{
          fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.3,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {t.company_name}
        </div>
      )}
      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "auto", paddingTop: "4px" }}>
        <span className="num" style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{t.holder_count}</span>
        {" "}holder{t.holder_count !== 1 ? "s" : ""}
      </div>
    </button>
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
  const priceNum  = parseFloat(pricePerShare) || 0;
  const total = sharesNum * priceNum;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!portfolioId)     { setError("Select a portfolio."); return; }
    if (sharesNum <= 0)   { setError("Enter a valid number of shares."); return; }
    if (priceNum  <= 0)   { setError("Enter a valid cost basis."); return; }

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();

      const { data: existing } = await supabase
        .from("holdings")
        .select("id, shares, average_cost_basis")
        .eq("portfolio_id", portfolioId)
        .eq("ticker", ticker)
        .maybeSingle();

      if (existing) {
        const existingShares = Number(existing.shares);
        const existingAvg    = Number(existing.average_cost_basis ?? priceNum);
        const newShares = existingShares + sharesNum;
        const newAvg    = (existingShares * existingAvg + sharesNum * priceNum) / newShares;
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
      <div className="bt-si" style={{
        position: "relative", zIndex: 1, width: "100%", maxWidth: "400px",
        background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-xl)", overflow: "hidden",
        boxShadow: "var(--shadow-lg)",
      }}>
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
            <div style={{ fontSize: "28px", marginBottom: "12px", color: "var(--green)" }}>✓</div>
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
                border: "none", borderRadius: "var(--radius-md)",
                color: "#fff", fontSize: "13px", fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-body)",
              }}
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
                Portfolio
              </label>
              {portfolios.length === 0 ? (
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No active portfolios found.</div>
              ) : (
                <select
                  value={portfolioId}
                  onChange={(e) => setPortfolioId(e.target.value)}
                  className="bt-select"
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
                Shares
              </label>
              <input
                type="number" step="0.000001" min="0.000001"
                placeholder="10"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                className="bt-input"
                style={{ fontFamily: "var(--font-mono)" }}
                onFocus={(e)  => (e.target.style.borderColor = "var(--brand-blue)")}
                onBlur={(e)   => (e.target.style.borderColor = "var(--card-border)")}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>
                Cost Basis / Share
              </label>
              <input
                type="number" step="0.000001" min="0.000001"
                placeholder="0.00"
                value={pricePerShare}
                onChange={(e) => setPricePerShare(e.target.value)}
                className="bt-input"
                style={{ fontFamily: "var(--font-mono)" }}
                onFocus={(e)  => (e.target.style.borderColor = "var(--brand-blue)")}
                onBlur={(e)   => (e.target.style.borderColor = "var(--card-border)")}
              />
            </div>

            {total > 0 && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 12px",
                background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)",
                borderRadius: "var(--radius-md)",
              }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Total cost</span>
                <span className="num" style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {formatPrice(total)}
                </span>
              </div>
            )}

            {error && (
              <div style={{ padding: "9px 12px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--red)" }}>
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
                  border: "none", borderRadius: "var(--radius-md)",
                  color: "#fff", fontSize: "13px", fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                  fontFamily: "var(--font-body)",
                  transition: "opacity 150ms ease",
                }}
                onPointerDown={(e) => { if (!submitting) e.currentTarget.style.transform = "scale(0.97)"; }}
                onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
              >
                {submitting ? "Adding..." : "Add to Portfolio"}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "10px 16px", background: "none",
                  border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)",
                  color: "var(--text-muted)", fontSize: "13px",
                  cursor: "pointer", fontFamily: "var(--font-body)",
                  transition: "color 150ms ease, border-color 150ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)";   e.currentTarget.style.borderColor = "var(--card-border)"; }}
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
  const [tab, setTab]           = useState<DetailTab>("overview");
  const [aiAnalysis, setAiAnalysis]   = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError, setAiError]         = useState<string | null>(null);
  const [aiCooldown, setAiCooldown]   = useState(false);
  const [buyOpen, setBuyOpen]         = useState(false);
  const [socialPulse, setSocialPulse]         = useState<RedditPulse | null>(null);
  const [socialLoading, setSocialLoading]     = useState(false);
  const [socialError, setSocialError]         = useState<string | null>(null);
  const [socialTicker, setSocialTicker]       = useState<string | null>(null);
  const [socialShowSources, setSocialShowSources] = useState(false);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tab !== "social" || socialTicker === result.ticker || socialLoading) return;
    const company = encodeURIComponent(result.profile?.name ?? result.ticker);
    setSocialLoading(true);
    setSocialError(null);
    setSocialPulse(null);
    fetch(`/api/social-pulse/${result.ticker}?company=${company}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === "unavailable" || d.status === "no_credentials" || d.status === "disabled" || d.error) {
          setSocialError(d.message ?? d.error ?? "Reddit Pulse unavailable for this ticker.");
        } else {
          setSocialPulse(d);
          setSocialTicker(result.ticker);
        }
      })
      .catch(() => setSocialError("Failed to load Reddit Pulse. Try again later."))
      .finally(() => setSocialLoading(false));
  }, [tab, result.ticker]);

  function refreshSocialPulse() {
    if (socialLoading) return;
    const company = encodeURIComponent(result.profile?.name ?? result.ticker);
    setSocialLoading(true);
    setSocialError(null);
    setSocialPulse(null);
    setSocialTicker(null);
    fetch(`/api/social-pulse/${result.ticker}?company=${company}&force=1`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === "unavailable" || d.status === "no_credentials" || d.status === "disabled" || d.error) {
          setSocialError(d.message ?? d.error ?? "Reddit Pulse unavailable.");
        } else {
          setSocialPulse(d);
          setSocialTicker(result.ticker);
        }
      })
      .catch(() => setSocialError("Failed to refresh Reddit Pulse."))
      .finally(() => setSocialLoading(false));
  }

  const TABS: { id: DetailTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "news",     label: result.news.length > 0 ? `News (${result.news.length})` : "News" },
    { id: "ai",       label: "AI Analysis" },
    { id: "social",   label: "Reddit Pulse" },
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

      {/* Drag handle — visible only on mobile via CSS */}
      <div className="research-drag-handle">
        <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--border-strong)" }} />
      </div>

      {/* Header */}
      <div style={{
        padding: "14px 18px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        gap: "12px", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
          <button
            onClick={onClose}
            title="Close"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: "28px", height: "28px", flexShrink: 0,
              background: "var(--bg-surface)", border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-md)", cursor: "pointer",
              color: "var(--text-tertiary)",
              transition: "color 150ms ease, border-color 150ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderColor = "var(--card-border)"; }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.92)"; }}
            onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
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
            <div style={{
              fontSize: "16px", fontWeight: 700, color: "var(--text-primary)",
              fontFamily: "var(--font-display)", letterSpacing: "-0.02em",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {result.profile?.name || result.ticker}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div className="num" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
              {formatPrice(result.quote.c)}
            </div>
            <div className="num" style={{ fontSize: "12px", color: isUp ? "var(--green)" : "var(--red)", marginTop: "3px" }}>
              {isUp ? "+" : ""}{result.quote.d.toFixed(2)} ({isUp ? "+" : ""}{result.quote.dp.toFixed(2)}%)
            </div>
          </div>
          <button
            onClick={() => setBuyOpen(true)}
            style={{
              padding: "8px 18px", background: "var(--brand-gradient)",
              border: "none", borderRadius: "var(--radius-md)",
              color: "#fff", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", fontFamily: "var(--font-body)",
              boxShadow: "var(--shadow-brand)",
              transition: "box-shadow 150ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-brand-lg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "var(--shadow-brand)"; e.currentTarget.style.transform = ""; }}
            onPointerDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
            onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
          >
            Buy
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid var(--border-subtle)", padding: "0 18px" }}
        className="bt-tabs-scroll"
      >
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
              transition: "color 150ms ease", marginBottom: "-1px",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div className="bt-tab-enter" style={{ padding: "16px 18px" }}>
          {(result.recommendation || result.priceTarget) ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              {result.recommendation && (() => {
                const rec   = result.recommendation!;
                const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
                const bullPct = total > 0 ? ((rec.strongBuy + rec.buy) / total) * 100 : 0;
                const holdPct = total > 0 ? (rec.hold / total) * 100 : 0;
                const bearPct = total > 0 ? ((rec.strongSell + rec.sell) / total) * 100 : 0;
                return (
                  <div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Analyst Ratings</div>
                    <div style={{ display: "flex", gap: "3px", height: "4px", borderRadius: "2px", overflow: "hidden", marginBottom: "8px" }}>
                      <div style={{ width: `${bullPct}%`, background: "var(--green)", flexShrink: 0 }} />
                      <div style={{ width: `${holdPct}%`, background: "var(--amber)", flexShrink: 0 }} />
                      <div style={{ width: `${bearPct}%`, background: "var(--red)",   flexShrink: 0 }} />
                    </div>
                    <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                      <span style={{ color: "var(--green)" }}>Buy {rec.strongBuy + rec.buy}</span>
                      <span style={{ color: "var(--amber)" }}>Hold {rec.hold}</span>
                      <span style={{ color: "var(--red)" }}>Sell {rec.strongSell + rec.sell}</span>
                    </div>
                  </div>
                );
              })()}
              {result.priceTarget && (
                <div>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Price Target</div>
                  <div className="num" style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-primary)" }}>{formatPrice(result.priceTarget.targetMean)}</div>
                  {upside !== null && (
                    <div className="num" style={{ fontSize: "11px", color: upside >= 0 ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
                      {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% upside
                    </div>
                  )}
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>
                    {formatPrice(result.priceTarget.targetLow)} — {formatPrice(result.priceTarget.targetHigh)}
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
        <div className="bt-tab-enter">
          {result.news.length === 0 ? (
            <div style={{ padding: "18px", fontSize: "13px", color: "var(--text-muted)" }}>No recent news found.</div>
          ) : (
            result.news.slice(0, 6).map((item, i) => (
              <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                style={{
                  display: "block", padding: "12px 18px",
                  borderBottom: i < 5 ? "1px solid var(--border-subtle)" : "none",
                  textDecoration: "none",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--card-hover)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "4px" }}>{item.headline}</div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{item.source} · {timeAgo(item.datetime)}</div>
              </a>
            ))
          )}
        </div>
      )}

      {/* AI Analysis */}
      {tab === "ai" && (
        <div className="bt-tab-enter" style={{ padding: "16px 18px" }}>
          {!aiAnalysis && !aiLoading && (
            <div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "14px" }}>
                AI-powered breakdown of {result.ticker} — bull case, bear case, key catalysts, and investor takeaway.
              </div>
              <button
                onClick={requestAI}
                disabled={aiCooldown}
                style={{
                  padding: "8px 18px", background: "var(--brand-gradient)",
                  border: "none", borderRadius: "var(--radius-md)",
                  color: "#fff", fontSize: "13px", fontWeight: 600,
                  fontFamily: "var(--font-body)",
                  cursor: aiCooldown ? "not-allowed" : "pointer",
                  opacity: aiCooldown ? 0.5 : 1,
                  transition: "opacity 150ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)",
                }}
                onPointerDown={(e) => { if (!aiCooldown) e.currentTarget.style.transform = "scale(0.97)"; }}
                onPointerUp={(e)   => { e.currentTarget.style.transform = ""; }}
              >
                Generate Analysis
              </button>
              {aiError && <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--red)" }}>{aiError}</div>}
            </div>
          )}
          {aiLoading && (
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Analyzing {result.ticker}...</div>
          )}
          {aiAnalysis && !aiLoading && (
            <div>
              {aiAnalysis.cached_at && (
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "14px" }}>
                  Generated {new Date(aiAnalysis.cached_at).toLocaleDateString()} · Confidence: <strong>{aiAnalysis.confidence}</strong>
                </div>
              )}
              {([
                { key: "bull_case",    label: "Bull Case",         color: "var(--green)" },
                { key: "bear_case",    label: "Bear Case",         color: "var(--red)" },
                { key: "key_catalysts",label: "Key Catalysts",     color: "var(--brand-blue)" },
                { key: "key_risks",    label: "Key Risks",         color: "var(--amber)" },
                { key: "takeaway",     label: "Investor Takeaway", color: "var(--violet)" },
              ] as const).map(({ key, label, color }) => (
                <div key={key} style={{ marginBottom: "12px" }}>
                  <div style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color, marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{aiAnalysis[key]}</div>
                </div>
              ))}
              <button
                onClick={() => { setAiAnalysis(null); setAiError(null); }}
                style={{
                  marginTop: "4px", padding: "5px 12px",
                  background: "none", border: "1px solid var(--card-border)",
                  borderRadius: "var(--radius-sm)", color: "var(--text-muted)",
                  fontSize: "11px", cursor: "pointer", fontFamily: "var(--font-body)",
                }}
              >
                Regenerate
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reddit Pulse */}
      {tab === "social" && (
        <div className="bt-tab-enter" style={{ padding: "16px 18px" }}>
          {socialLoading && (
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Fetching Reddit discussion for {result.ticker}...
            </div>
          )}
          {socialError && !socialLoading && (
            <div>
              <div style={{ padding: "10px 12px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>
                {socialError}
              </div>
              <button onClick={refreshSocialPulse} style={{ padding: "6px 14px", background: "none", border: "1px solid var(--card-border)", borderRadius: "var(--radius-sm)", color: "var(--text-secondary)", fontSize: "12px", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                Try again
              </button>
            </div>
          )}
          {socialPulse && !socialLoading && (() => {
            const sp = socialPulse;

            if (sp.source === "apewisdom") {
              const trendScore  = sp.reddit_trend_score ?? 0;
              const trendColor  = trendScore >= 70 ? "var(--green)" : trendScore >= 45 ? "var(--amber)" : "var(--text-secondary)";
              const changeColor = (sp.mention_change_pct ?? 0) >= 0 ? "var(--green)" : "var(--red)";
              return (
                <div>
                  <div style={{ padding: "5px 10px", background: "rgba(245,158,11,0.08)", border: "1px solid var(--amber-border)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--amber)", marginBottom: "14px" }}>
                    Reddit Trend Data via ApeWisdom — full sentiment analysis available once Reddit API is approved
                  </div>
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div style={{ textAlign: "center", flexShrink: 0 }}>
                      <div className="num" style={{ fontSize: "26px", fontWeight: 700, color: trendColor, lineHeight: 1 }}>
                        {trendScore}<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>/100</span>
                      </div>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "2px" }}>Trend Score</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {sp.rank != null && (
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                          Rank #{sp.rank}
                          {sp.rank_change != null && sp.rank_change !== 0 && (
                            <span style={{ fontSize: "11px", color: sp.rank_change > 0 ? "var(--green)" : "var(--red)", marginLeft: "6px" }}>
                              {sp.rank_change > 0 ? `+${sp.rank_change}` : sp.rank_change}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {sp.mentions ?? 0} mentions · {sp.upvotes ?? 0} upvotes
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Mentions (7d)</div>
                      <div className="num" style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>{sp.mentions ?? 0}</div>
                    </div>
                    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>24h Change</div>
                      <div className="num" style={{ fontSize: "16px", fontWeight: 600, color: changeColor }}>
                        {(sp.mention_change_pct ?? 0) >= 0 ? "+" : ""}{sp.mention_change_pct ?? 0}%
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Data from ApeWisdom · Cached 30 min</div>
                </div>
              );
            }

            const scoreColor  = sp.sentiment_score >= 15 ? "var(--green)" : sp.sentiment_score <= -15 ? "var(--red)" : "var(--text-secondary)";
            const subColor    = (s: string) => s === "bullish" ? "var(--green)" : s === "bearish" ? "var(--red)" : s === "mixed" ? "var(--amber)" : "var(--text-muted)";
            return (
              <div>
                {sp.stale && (
                  <div style={{ padding: "5px 10px", background: "rgba(245,158,11,0.1)", border: "1px solid var(--amber-border)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--amber)", marginBottom: "12px" }}>
                    Showing cached data — Reddit unavailable
                  </div>
                )}
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div style={{ textAlign: "center", flexShrink: 0 }}>
                    <div className="num" style={{ fontSize: "26px", fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
                      {sp.reddit_pulse_score}<span style={{ fontSize: "11px", color: "var(--text-muted)" }}>/100</span>
                    </div>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "2px" }}>Reddit Pulse</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: scoreColor, marginBottom: "3px" }}>{sp.sentiment_label}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {sp.post_count} posts · {sp.ai_powered ? "AI analyzed" : "Keyword analysis"}
                    </div>
                    {sp.summary && (
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: 1.5 }}>{sp.summary}</div>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Sentiment</div>
                  <div style={{ display: "flex", gap: "2px", height: "4px", borderRadius: "2px", overflow: "hidden", marginBottom: "5px" }}>
                    <div style={{ width: `${sp.bullish_pct}%`, background: "var(--green)", flexShrink: 0 }} />
                    <div style={{ width: `${sp.neutral_pct}%`, background: "var(--border-subtle)", flexShrink: 0 }} />
                    <div style={{ width: `${sp.bearish_pct}%`, background: "var(--red)", flexShrink: 0 }} />
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--green)" }}>Bull {sp.bullish_pct}%</span>
                    <span style={{ color: "var(--text-muted)" }}>Neutral {sp.neutral_pct}%</span>
                    <span style={{ color: "var(--red)" }}>Bear {sp.bearish_pct}%</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                  {[
                    { label: "Conviction", value: sp.conviction_score, color: sp.conviction_score >= 60 ? "var(--green)" : sp.conviction_score >= 35 ? "var(--amber)" : "var(--text-secondary)" },
                    { label: "Hype Risk",  value: sp.hype_score,       color: sp.hype_score >= 65 ? "var(--red)" : sp.hype_score >= 40 ? "var(--amber)" : "var(--text-secondary)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>{label}</div>
                      <div className="num" style={{ fontSize: "16px", fontWeight: 600, color }}>{value}<span style={{ fontSize: "10px", color: "var(--text-muted)" }}>/100</span></div>
                    </div>
                  ))}
                </div>
                {(sp.top_bullish_themes.length > 0 || sp.top_bearish_themes.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    {sp.top_bullish_themes.length > 0 && (
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Bullish</div>
                        {sp.top_bullish_themes.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px", lineHeight: 1.3 }}>· {t}</div>
                        ))}
                      </div>
                    )}
                    {sp.top_bearish_themes.length > 0 && (
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Bearish</div>
                        {sp.top_bearish_themes.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px", lineHeight: 1.3 }}>· {t}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {(sp.top_risks.length > 0 || sp.top_catalysts.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    {sp.top_risks.length > 0 && (
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Risks</div>
                        {sp.top_risks.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>· {t}</div>
                        ))}
                      </div>
                    )}
                    {sp.top_catalysts.length > 0 && (
                      <div>
                        <div style={{ fontSize: "9px", color: "var(--brand-blue)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Catalysts</div>
                        {sp.top_catalysts.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>· {t}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {sp.subreddit_breakdown.length > 0 && (
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "9px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>By Subreddit</div>
                    {sp.subreddit_breakdown.map((sub) => (
                      <div key={sub.subreddit} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>r/{sub.subreddit}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{sub.post_count}p</span>
                          <span style={{ fontSize: "11px", color: subColor(sub.sentiment), fontWeight: 500 }}>{sub.sentiment_label}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {sp.source_post_links.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <button
                      onClick={() => setSocialShowSources((v) => !v)}
                      style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0, marginBottom: "6px" }}
                    >
                      {socialShowSources ? "Hide sources" : `Show top ${sp.source_post_links.length} source posts`}
                    </button>
                    {socialShowSources && sp.source_post_links.map((link, i) => (
                      <a key={i} href={link.permalink} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", padding: "7px 0", borderBottom: i < sp.source_post_links.length - 1 ? "1px solid var(--border-subtle)" : "none", textDecoration: "none" }}>
                        <div style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "2px" }}>{link.title}</div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>r/{link.subreddit} · +{link.score} · {link.comment_count} comments</div>
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px" }}>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                    {sp.ai_powered ? "AI-analyzed" : "Keyword analysis"} · Updated {new Date(sp.fetched_at).toLocaleDateString()}
                  </div>
                  <button
                    onClick={refreshSocialPulse}
                    style={{ padding: "4px 10px", background: "none", border: "1px solid var(--card-border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", fontSize: "11px", cursor: "pointer", fontFamily: "var(--font-body)" }}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResearchClient({ portfolios }: { portfolios: Portfolio[] }) {
  const [query, setQuery]               = useState("");
  const [searching, setSearching]       = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError]   = useState<string | null>(null);

  const [screener, setScreener]               = useState<ScreenerSection[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(true);

  const [trending, setTrending]               = useState<TrendingTicker[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingHasData, setTrendingHasData] = useState(false);

  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  const topRef     = useRef<HTMLDivElement>(null);
  const inflightRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/research/screener")
      .then((r) => r.json())
      .then((d) => setScreener(d.sections ?? []))
      .catch(() => {})
      .finally(() => setScreenerLoading(false));
    fetch("/api/research/trending")
      .then((r) => r.json())
      .then((d) => { setTrending(d.trending ?? []); setTrendingHasData(d.has_data ?? false); })
      .catch(() => {})
      .finally(() => setTrendingLoading(false));
  }, []);

  // Lock body scroll on mobile when detail panel is open
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && searchResult) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [searchResult]);

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
  function clearSearch() {
    setQuery("");
    setSearchResult(null);
    setSearchError(null);
  }

  const nameMap = new Map<string, string>();
  for (const section of screener) for (const t of section.tickers) nameMap.set(t.ticker, t.name);

  const showPopular      = activeFilter === "all" || activeFilter === "popular";
  const screenerSections = activeFilter === "popular" ? [] : activeFilter === "all"
    ? screener
    : screener.filter((s) => s.id === activeFilter);

  return (
    <div ref={topRef} style={{ maxWidth: "900px" }}>

      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "12px" }}>
        <div style={{ position: "relative" }}>
          <svg
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none", flexShrink: 0 }}
            width="15" height="15" viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="Search — AAPL, NVDA, TSLA..."
            style={{
              width: "100%",
              padding: "12px 44px 12px 40px",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-mono)",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 150ms ease, box-shadow 150ms ease",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--brand-blue)";
              e.target.style.boxShadow   = "0 0 0 3px rgba(37,99,235,0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--card-border)";
              e.target.style.boxShadow   = "none";
            }}
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              style={{
                position: "absolute", right: "13px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--text-muted)", padding: "4px", display: "flex", alignItems: "center",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "6px", marginBottom: "24px" }}
        className="bt-tabs-scroll"
      >
        {FILTER_CHIPS.map((chip) => (
          <FilterChip
            key={chip.id}
            label={chip.label}
            active={activeFilter === chip.id}
            onClick={() => setActiveFilter(chip.id)}
          />
        ))}
      </div>

      {/* Search feedback */}
      {searching && (
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
          Searching {query}...
        </div>
      )}
      {searchError && (
        <div style={{ padding: "11px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", color: "var(--red)", fontSize: "13px", marginBottom: "18px" }}>
          {searchError}
        </div>
      )}

      {/* Detail view + mobile backdrop */}
      {searchResult && !searching && (
        <>
          <div className="research-detail-backdrop" onClick={clearSearch} />
          <div
            className="research-detail-panel"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
              marginBottom: "24px",
            }}
          >
            <DetailView
              result={searchResult}
              portfolios={portfolios}
              onClose={clearSearch}
            />
          </div>
        </>
      )}

      {/* Popular on BuyTune */}
      {showPopular && (
        <div style={{ marginBottom: "28px" }}>
          <SectionHeader label="Popular on BuyTune" sectionId="popular" />
          {trendingLoading ? (
            <div className="research-section-row">
              {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : !trendingHasData || trending.length === 0 ? (
            <div style={{
              padding: "13px 16px",
              background: "var(--card-bg)",
              border: "1px dashed var(--card-border)",
              borderRadius: "var(--radius-md)",
              fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5,
            }}>
              Popularity signals appear as BuyTune activity grows.
            </div>
          ) : (
            <div className="research-section-row">
              {trending.map((t) => (
                <TrendingCard
                  key={t.ticker}
                  t={{ ...t, company_name: t.company_name ?? nameMap.get(t.ticker) ?? null }}
                  onClick={(ticker) => { setQuery(ticker); doSearch(ticker); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Screener sections */}
      {screenerLoading ? (
        <>
          {[0, 1, 2].map((si) => (
            <div key={si} style={{ marginBottom: "28px" }}>
              <div className="bt-skeleton" style={{ width: "90px", height: "10px", borderRadius: "3px", marginBottom: "14px" }} />
              <div className="research-section-row">
                {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
              </div>
            </div>
          ))}
        </>
      ) : (
        screenerSections.map((section) => (
          <div key={section.id} style={{ marginBottom: "28px" }}>
            <SectionHeader label={section.label} sectionId={section.id} />
            <div className="research-section-row">
              {section.tickers.map((t) => (
                <StockCard
                  key={t.ticker}
                  t={t}
                  onClick={(ticker) => { setQuery(ticker); trackEvent(ticker, "stock_card_click"); doSearch(ticker); }}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
