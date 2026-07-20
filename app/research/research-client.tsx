"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdviceDisclaimer from "@/app/components/advice-disclaimer";
import Sparkline from "@/app/components/sparkline";
import StockChart from "@/app/components/stock-chart";
import ScenariosPanel from "./scenarios-panel";
import CongressSection, { CongressTickerCard } from "./congress-section";
import StockLogo from "@/app/components/stock-logo";
import PageTutorial from "@/app/components/page-tutorial";

// ─── Types ────────────────────────────────────────────────────────────────────

type Portfolio = { id: string; name: string };
type Quote = { c: number; d: number; dp: number };

type SearchResult = {
  ticker: string;
  quote: Quote;
  profile: { name: string; logo: string; weburl: string; marketCap: number | null; industry: string | null } | null;
  recommendation: {
    buy: number; hold: number; sell: number;
    strongBuy: number; strongSell: number;
  } | null;
  priceTarget: { targetMean: number; targetHigh: number; targetLow: number } | null;
  metrics: { peRatio: number | null; weekHigh52: number | null; weekLow52: number | null } | null;
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
  ticker: string; name: string;
  price?: number; change?: number; changePct?: number;
  analystRec?: { buy: number; hold: number; sell: number } | null;
};

type RawEarning = { quarter: string; actual: number | null; estimate: number | null; beat: boolean | null };

type RawMetrics = {
  netMarginTTM?: number | null;
  revenueGrowth3Y?: number | null;
  epsGrowth3Y?: number | null;
  roeTTM?: number | null;
  peBasicExclExtraTTM?: number | null;
  currentRatioAnnual?: number | null;
  debtToEquityAnnual?: number | null;
};

type RawRecommendation = {
  buy: number; hold: number; sell: number; strongBuy: number; strongSell: number; period: string;
};

type CompanyProfile = {
  finnhubIndustry?: string; country?: string; ipo?: string; name?: string;
};

type DigestResult = {
  company_overview: string;
  news_digest: string;
  earnings_snapshot: string | null;
  financial_snapshot: string | null;
  market_outlook: string;
  generated_at: string;
  raw_earnings: RawEarning[];
  raw_metrics: RawMetrics | null;
  raw_recommendation: RawRecommendation | null;
  profile: CompanyProfile | null;
};

type AiAnalysis = {
  verdict: "BUY" | "HOLD" | "SELL";
  conviction: "Low" | "Medium" | "High";
  price_target: number | null;
  timeframe: string;
  bull_case: string;
  bear_case: string;
  key_catalysts: string;
  key_risks: string;
  takeaway: string;
  cached_at: string;
};

type MyPosition = {
  owned: boolean;
  shares: number | null;
  portfolio_id: string | null;
  portfolio_name: string | null;
  rec: {
    verdict: "BUY" | "SELL" | "TRIM" | "HOLD";
    conviction: string | null;
    price_target: number | null;
    created_at: string | null;
    portfolio_id: string | null;
  } | null;
};

type FilterId = "all" | "trending" | "daily_movers" | "growth" | "momentum" | "dividend" | "defensive" | "popular" | "scenarios";

type InsiderTx = {
  name: string;
  transactionDate: string;
  transactionCode: string;
  share: number;
  change: number;
  transactionPrice: number;
};

type InsiderData = {
  transactions: InsiderTx[];
  netBuys: number;
  netSells: number;
  signal: "buy" | "sell" | "neutral";
};

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
  return { label: "Hold", color: "var(--violet)", bg: "var(--violet-bg)" };
}

function formatPrice(p: number | string | undefined | null) {
  // Coerce first: isNaN("5") is false, so a string price would slip past a
  // naive guard and then "5".toFixed() throws "toFixed is not a function".
  const n = typeof p === "number" ? p : Number(p);
  if (!Number.isFinite(n) || n === 0) return "—";
  return n >= 1000
    ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${n.toFixed(2)}`;
}

// Safe fixed-decimal formatter — never throws on null/undefined/string inputs
// (thin stocks return null for change/PE/target fields).
function safeFixed(v: unknown, digits = 2, withSign = false): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${withSign && n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function timeAgo(unix: number) {
  if (!unix) return "";
  const diff = Date.now() / 1000 - unix;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

type TrackEventType = "ticker_search" | "stock_card_click" | "stock_detail_view" | "ai_analysis_requested" | "scenario_ticker_click" | "congress_ticker_click";

function trackEvent(ticker: string, eventType: TrackEventType) {
  fetch("/api/research/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker, event_type: eventType }),
  }).catch(() => {});
}

// ─── Sparkline fetch helpers ──────────────────────────────────────────────────
// Card sparklines use /api/sparkline/[ticker] (Finnhub daily, 60 req/min).
// Twelve Data is reserved for the full interactive chart in the detail view.

// Client-side cache — survives navigation within the same session
const _sparkCache = new Map<string, { pts: number[] | null; ts: number }>();
const SPARK_CLIENT_TTL = 10 * 60 * 1000; // 10 min for a successful chart
const SPARK_FAIL_TTL = 60 * 1000;        // but only 1 min for a miss, so a transient provider
                                         // failure retries soon instead of staying chart-less

// Concurrency limiter — Finnhub free tier is 60/min, but still avoid pile-ups
const MAX_CONCURRENT = 6;
let _sparkActive = 0;
const _sparkQueue: (() => void)[] = [];

function sparkAcquire(): Promise<void> {
  return new Promise((resolve) => {
    if (_sparkActive < MAX_CONCURRENT) {
      _sparkActive++;
      resolve();
    } else {
      _sparkQueue.push(() => { _sparkActive++; resolve(); });
    }
  });
}

function sparkRelease() {
  _sparkActive--;
  const next = _sparkQueue.shift();
  if (next) next();
}

// ─── Filter / section config ──────────────────────────────────────────────────

const FILTER_CHIPS: { id: FilterId; label: string }[] = [
  { id: "all",          label: "All" },
  { id: "scenarios",    label: "If/Then Plays" },
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
  dividend:     "var(--violet)",
  defensive:    "var(--green)",
  popular:      "var(--violet)",
};

// ─── Primitive components ─────────────────────────────────────────────────────

function FilterChip({ active, label, onClick, accent }: { active: boolean; label: string; onClick: () => void; accent?: "purple" }) {
  const purple = accent === "purple";
  const activeColor   = purple ? "rgba(139,92,246,0.45)" : "rgba(14,165,160,0.45)";
  const activeBg      = purple ? "rgba(139,92,246,0.12)" : "rgba(14,165,160,0.12)";
  const activeText    = purple ? "#c4b5fd" : "#7fd9d4";
  const activeShadow  = purple ? "0 0 0 1px rgba(139,92,246,0.1)" : "0 0 0 1px rgba(14,165,160,0.1)";
  const inactiveColor = purple ? "rgba(139,92,246,0.3)" : "var(--card-border)";
  const inactiveText  = purple ? "#6fd08a" : "var(--text-tertiary)";

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
        border: `1px solid ${active ? activeColor : inactiveColor}`,
        background: active ? activeBg : "transparent",
        color: active ? activeText : inactiveText,
        boxShadow: active ? activeShadow : "none",
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
        <div style={{ width: `${holdPct}%`, background: "var(--violet)", flexShrink: 0 }} />
        <div style={{ width: `${sellPct}%`, background: "var(--red)",   flexShrink: 0 }} />
      </div>
      <div style={{ display: "flex", gap: "7px", fontSize: "10px", fontWeight: 600, fontFamily: "var(--font-mono)" }}>
        <span style={{ color: "var(--green)" }}>B {rec.buy}</span>
        <span style={{ color: "var(--violet)" }}>H {rec.hold}</span>
        <span style={{ color: "var(--red)" }}>S {rec.sell}</span>
      </div>
    </div>
  );
}

// ─── Stock cards ──────────────────────────────────────────────────────────────

function StockCard({ t, onClick }: { t: ScreenerTicker; onClick: (ticker: string) => void }) {
  const isUp = (t.changePct ?? 0) >= 0;
  const hasQuote = t.price != null && t.price !== 0;

  const cardRef = useRef<HTMLButtonElement>(null);
  const [sparkPoints, setSparkPoints] = useState<number[] | null>(null);
  const [sparkLoading, setSparkLoading] = useState(true);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) { setSparkLoading(false); return; }
    let cancelled = false;

    // Check client-side cache first — avoids re-fetching on navigation
    const cacheKey = t.ticker;
    const clientHit = _sparkCache.get(cacheKey);
    if (clientHit && Date.now() - clientHit.ts < (clientHit.pts ? SPARK_CLIENT_TTL : SPARK_FAIL_TTL)) {
      setSparkPoints(clientHit.pts);
      setSparkLoading(false);
      return;
    }

    function doFetch() {
      sparkAcquire().then(() => {
        if (cancelled) { sparkRelease(); return; }
        // Uses Finnhub daily (60 req/min) — not Twelve Data
        fetch(`/api/sparkline/${encodeURIComponent(t.ticker)}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => {
            sparkRelease();
            if (cancelled) return;
            const pts = ((d?.points ?? []) as number[])
              .filter((v) => Number.isFinite(v) && v > 0);
            const result = pts.length >= 2 ? pts : null;
            _sparkCache.set(cacheKey, { pts: result, ts: Date.now() });
            setSparkPoints(result);
            setSparkLoading(false);
          })
          .catch(() => { sparkRelease(); if (!cancelled) setSparkLoading(false); });
      });
    }

    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        doFetch();
      },
      { rootMargin: "100px" }
    );

    obs.observe(el);
    return () => {
      cancelled = true;
      obs.disconnect();
    };
  }, [t.ticker]);

  return (
    <button
      ref={cardRef}
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
        transition: "border-color 150ms ease, background 150ms ease, transform 160ms cubic-bezier(0.23,1,0.32,1)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(14,165,160,0.35)";
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
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px", alignSelf: "flex-start" }}>
        <StockLogo ticker={t.ticker} size={26} radius={6} />
        <span className="ticker" style={{ fontSize: "11px", padding: "2px 7px", display: "inline-block" }}>
          {t.ticker}
        </span>
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.35, flex: 1, marginBottom: "8px" }}>
        {t.name}
      </div>
      {hasQuote ? (
        <div style={{ marginBottom: "7px" }}>
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
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "7px" }}>—</div>
      )}

      {/* 1D sparkline — lazy-loaded via IntersectionObserver */}
      <div style={{ height: "32px", marginBottom: "8px" }}>
        {sparkLoading ? (
          <div className="bt-skeleton" style={{ height: "100%", borderRadius: "3px" }} />
        ) : sparkPoints ? (
          <Sparkline points={sparkPoints} positive={isUp} height={32} />
        ) : (
          <svg width="100%" height="32" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
            <line x1="0" y1="16" x2="100" y2="16" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "8px" }}>
        <AnalystBar rec={t.analystRec} />
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
          background: "linear-gradient(135deg, rgba(14,165,160,0.06), rgba(63,174,74,0.03))",
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
                background: "rgba(14,165,160,0.06)", border: "1px solid rgba(14,165,160,0.15)",
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

// ─── Mini Charts ──────────────────────────────────────────────────────────────

function EarningsChart({ earnings }: { earnings: RawEarning[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const valid = [...earnings].reverse().filter(
    (e) => e.actual != null || e.estimate != null
  );
  if (valid.length === 0) return null;

  const posVals = valid
    .flatMap((e) => [e.actual, e.estimate])
    .filter((v): v is number => v != null && v > 0);
  if (posVals.length === 0) return null;

  const maxVal = Math.max(...posVals) * 1.2;
  const chartH = 72;
  const yAxisW = 36;
  const fmtEps = (n: number) => `$${n.toFixed(2)}`;
  const gridLines = [0.5, 1.0].map((f) => ({ pct: f * 100, label: fmtEps(maxVal * f) }));

  return (
    <>
      <style>{`
        @keyframes bt-bar-rise { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .bt-bar-r { transform-origin: bottom center; animation: bt-bar-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
      `}</style>

      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div style={{ width: "8px", height: "8px", background: "rgba(255,255,255,0.22)", borderRadius: "1px" }} />
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Est</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <div style={{ width: "8px", height: "8px", background: "var(--green)", borderRadius: "1px" }} />
          <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Actual</span>
        </div>
      </div>

      <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px 6px", background: "var(--bg-surface)" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          {/* Y-axis */}
          <div style={{ width: `${yAxisW}px`, flexShrink: 0, position: "relative", height: `${chartH}px` }}>
            {gridLines.map((g, gi) => (
              <div key={gi} style={{ position: "absolute", bottom: `${g.pct}%`, right: 0, transform: "translateY(50%)", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {g.label}
              </div>
            ))}
          </div>

          {/* Plot area */}
          <div style={{ flex: 1, position: "relative", height: `${chartH}px` }}>
            {/* Gridlines */}
            {gridLines.map((g, gi) => (
              <div key={gi} style={{ position: "absolute", left: 0, right: 0, bottom: `${g.pct}%`, height: "1px", background: g.pct === 100 ? "var(--border-subtle)" : "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
            ))}

            {/* Bar groups */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: "4px" }}>
              {valid.map((e, i) => {
                const actualH = e.actual != null && e.actual > 0 ? Math.max(3, (e.actual / maxVal) * chartH) : 0;
                const estH    = e.estimate != null && e.estimate > 0 ? Math.max(3, (e.estimate / maxVal) * chartH) : 0;
                const barColor = e.beat === true ? "var(--green)" : e.beat === false ? "var(--red)" : "var(--brand-blue)";
                const isHovered = hoverIdx === i;
                const isDimmed  = hoverIdx !== null && !isHovered;
                return (
                  <div
                    key={i}
                    style={{ flex: 1, height: "100%", position: "relative" }}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                  >
                    {/* Tooltip — floats above bars, no background box on the bars */}
                    {isHovered && (
                      <div style={{
                        position: "absolute",
                        bottom: `${Math.max(actualH, estH) + 10}px`,
                        left: "50%", transform: "translateX(-50%)",
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--border-strong)",
                        borderRadius: "var(--radius-sm)",
                        padding: "5px 8px", zIndex: 20,
                        whiteSpace: "nowrap",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.45)",
                        pointerEvents: "none",
                      }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textAlign: "center" }}>{e.quarter}</div>
                        {e.estimate != null && <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Est: {fmtEps(e.estimate)}</div>}
                        {e.actual != null && (
                          <div style={{ fontSize: "10px", fontWeight: 600, color: barColor, fontFamily: "var(--font-mono)" }}>
                            Act: {fmtEps(e.actual)}{e.beat === true ? " ✓" : e.beat === false ? " ✗" : ""}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bars — brightness on hover, no box */}
                    <div style={{
                      position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)",
                      display: "flex", alignItems: "flex-end", gap: "2px",
                      opacity: isDimmed ? 0.25 : 1,
                      filter: isHovered ? "brightness(1.5) saturate(1.2)" : "none",
                      transition: "opacity 180ms ease, filter 180ms ease",
                    }}>
                      {estH > 0 && (
                        <div className="bt-bar-r" style={{ width: "11px", height: `${estH}px`, background: "rgba(255,255,255,0.22)", borderRadius: "2px 2px 0 0", animationDelay: `${i * 0.07}s` }} />
                      )}
                      {actualH > 0 && (
                        <div className="bt-bar-r" style={{ width: "11px", height: `${actualH}px`, background: barColor, borderRadius: "2px 2px 0 0", animationDelay: `${i * 0.07 + 0.05}s` }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis labels */}
        <div style={{ display: "flex", gap: "4px", marginTop: "6px", paddingLeft: `${yAxisW + 8}px` }}>
          {valid.map((e, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <span style={{ fontSize: "10px", color: hoverIdx === i ? "var(--text-primary)" : "var(--text-muted)", fontWeight: hoverIdx === i ? 600 : 400, transition: "color 150ms ease" }}>
                {e.quarter}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FinancialMetricsGrid({ metrics }: { metrics: RawMetrics }) {
  // netMarginTTM comes as decimal (0.241); growth/ROE come as already-percentage (1.81, 146.69)
  const fmtPct = (n: number) => `${safeFixed(n, 1)}%`;
  const fmtSignedPct = (n: number) => `${safeFixed(n, 1, true)}%`;

  const items: { label: string; value: string; color: string }[] = [];

  if (metrics.netMarginTTM != null) {
    const v = metrics.netMarginTTM * 100;
    items.push({ label: "Net Margin", value: fmtPct(v), color: v >= 20 ? "var(--green)" : v >= 8 ? "var(--violet)" : "var(--red)" });
  }
  if (metrics.revenueGrowth3Y != null) {
    const v = metrics.revenueGrowth3Y;
    items.push({ label: "Rev Growth 3Y", value: fmtSignedPct(v), color: v >= 10 ? "var(--green)" : v >= 0 ? "var(--violet)" : "var(--red)" });
  }
  if (metrics.epsGrowth3Y != null) {
    const v = metrics.epsGrowth3Y;
    items.push({ label: "EPS Growth 3Y", value: fmtSignedPct(v), color: v >= 10 ? "var(--green)" : v >= 0 ? "var(--violet)" : "var(--red)" });
  }
  if (metrics.roeTTM != null) {
    const v = metrics.roeTTM;
    items.push({ label: "ROE", value: fmtPct(v), color: v >= 15 ? "var(--green)" : v >= 5 ? "var(--violet)" : "var(--red)" });
  }
  if (metrics.currentRatioAnnual != null) {
    const v = metrics.currentRatioAnnual;
    items.push({ label: "Current Ratio", value: safeFixed(v, 2), color: v >= 1.5 ? "var(--green)" : v >= 1 ? "var(--violet)" : "var(--red)" });
  }
  if (metrics.debtToEquityAnnual != null) {
    const v = metrics.debtToEquityAnnual;
    items.push({ label: "Debt/Equity", value: safeFixed(v, 2), color: v <= 1 ? "var(--green)" : v <= 2 ? "var(--violet)" : "var(--red)" });
  }

  if (items.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
      {items.map((item, i) => (
        <div key={i} style={{ padding: "8px 10px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>
            {item.label}
          </div>
          <div className="num" style={{ fontSize: "13px", fontWeight: 600, color: item.color, lineHeight: 1 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({
  result, portfolios, onClose,
}: {
  result: SearchResult; portfolios: Portfolio[]; onClose: () => void;
}) {
  const [digest, setDigest]               = useState<DigestResult | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestError, setDigestError]     = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis]           = useState<AiAnalysis | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [grokAnalysis, setGrokAnalysis]       = useState<AiAnalysis | null>(null);
  const [grokLoading, setGrokLoading]         = useState(false);
  const [grokError, setGrokError]             = useState<string | null>(null);
  const [buyOpen, setBuyOpen]             = useState(false);
  const [socialPulse, setSocialPulse]         = useState<RedditPulse | null>(null);
  const [socialLoading, setSocialLoading]     = useState(false);
  const [socialError, setSocialError]         = useState<string | null>(null);
  const [socialTicker, setSocialTicker]       = useState<string | null>(null);
  const [socialShowSources, setSocialShowSources] = useState(false);
  const [insiderData, setInsiderData]         = useState<InsiderData | null>(null);
  const [insiderLoading, setInsiderLoading]   = useState(false);
  const [insiderTicker, setInsiderTicker]     = useState<string | null>(null);
  const [myPosition, setMyPosition]           = useState<MyPosition | null>(null);


  const rating = analystLabel(result.recommendation);
  const upside =
    result.priceTarget?.targetMean && result.quote.c > 0
      ? ((result.priceTarget.targetMean - result.quote.c) / result.quote.c) * 100
      : null;
  const isUp = result.quote.dp >= 0;

  // Auto-load AI verdict on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setAiAnalysisLoading(true);
    setAiAnalysis(null);
    setGrokAnalysis(null);
    setGrokError(null);
    setGrokLoading(false);
    fetch("/api/research/ai-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: result.ticker,
        company_name: result.profile?.name ?? result.ticker,
        price: result.quote.c,
        change_pct: result.quote.dp,
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (!d.error) setAiAnalysis(d as AiAnalysis); })
      .catch(() => {})
      .finally(() => setAiAnalysisLoading(false));
  }, [result.ticker]);

  // On-demand Grok deep-dive (live web + X search) — costs tokens, button-triggered
  function runGrokAnalysis() {
    if (grokLoading) return;
    setGrokLoading(true);
    setGrokError(null);
    fetch("/api/research/grok-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: result.ticker,
        company_name: result.profile?.name ?? result.ticker,
        price: result.quote.c,
        change_pct: result.quote.dp,
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) setGrokError(d.error); else setGrokAnalysis(d as AiAnalysis); })
      .catch(() => setGrokError("Grok analysis failed. Try again."))
      .finally(() => setGrokLoading(false));
  }

  // Auto-load digest on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDigestLoading(true);
    setDigestError(null);
    fetch("/api/research/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: result.ticker,
        company_name: result.profile?.name ?? result.ticker,
        price: result.quote.c,
        change_pct: result.quote.dp,
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setDigest(d as DigestResult); })
      .catch((err) => setDigestError((err as Error).message ?? "Unable to generate digest."))
      .finally(() => setDigestLoading(false));
  }, [result.ticker]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (insiderTicker === result.ticker || insiderLoading) return;
    setInsiderLoading(true);
    setInsiderData(null);
    fetch(`/api/insider/${result.ticker}`)
      .then((r) => r.json())
      .then((d: InsiderData) => { setInsiderData(d); setInsiderTicker(result.ticker); })
      .catch(() => setInsiderData({ transactions: [], netBuys: 0, netSells: 0, signal: "neutral" }))
      .finally(() => setInsiderLoading(false));
  }, [result.ticker]);

  // Your personalized portfolio call for this ticker (if owned / previously analyzed).
  useEffect(() => {
    setMyPosition(null);
    fetch(`/api/research/my-position?ticker=${encodeURIComponent(result.ticker)}`)
      .then((r) => r.json())
      .then((d: MyPosition) => setMyPosition(d))
      .catch(() => {});
  }, [result.ticker]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (socialTicker === result.ticker || socialLoading) return;
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
  }, [result.ticker]);

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
          <StockLogo ticker={result.ticker} src={result.profile?.logo} size={40} radius={10} />
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
              {safeFixed(result.quote.d, 2, true)} ({safeFixed(result.quote.dp, 2, true)}%)
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

      {/* Chart + key stats + analyst — always visible */}
      <div style={{ padding: "16px 18px" }}>
        <div style={{ marginBottom: "18px" }}>
          <StockChart key={result.ticker} ticker={result.ticker} height={180} defaultRange="1D" showRangeControls />
        </div>

        {(result.profile?.marketCap || result.profile?.industry || result.metrics?.peRatio || result.metrics?.weekHigh52) && (
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
            gap: "1px", background: "var(--border-subtle)",
            border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)",
            overflow: "hidden", marginBottom: "18px",
          }}>
            {result.profile?.marketCap && (
              <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Mkt Cap</div>
                <div className="num" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {Number(result.profile.marketCap) >= 1_000_000
                    ? `$${safeFixed(Number(result.profile.marketCap) / 1_000_000, 2)}T`
                    : Number(result.profile.marketCap) >= 1_000
                    ? `$${safeFixed(Number(result.profile.marketCap) / 1_000, 1)}B`
                    : `$${Math.round(Number(result.profile.marketCap))}M`}
                </div>
              </div>
            )}
            {result.metrics?.peRatio && result.metrics.peRatio > 0 && (
              <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>P/E (TTM)</div>
                <div className="num" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{safeFixed(result.metrics.peRatio, 1)}x</div>
              </div>
            )}
            {result.metrics?.weekHigh52 && result.metrics?.weekLow52 && (
              <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>52-Wk Range</div>
                <div className="num" style={{ lineHeight: 1.45 }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--red)" }}>{formatPrice(result.metrics.weekLow52)}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)" }}>{formatPrice(result.metrics.weekHigh52)}</div>
                </div>
              </div>
            )}
            {result.profile?.industry && (
              <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Industry</div>
                <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", lineHeight: 1.3, overflowWrap: "anywhere", wordBreak: "break-word" }}>{result.profile.industry}</div>
              </div>
            )}
          </div>
        )}

        {(result.recommendation || result.priceTarget) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {result.recommendation && (() => {
              const rec   = result.recommendation!;
              const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
              const bullPct = total > 0 ? ((rec.strongBuy + rec.buy) / total) * 100 : 0;
              const holdPct = total > 0 ? (rec.hold / total) * 100 : 0;
              const bearPct = total > 0 ? ((rec.strongSell + rec.sell) / total) * 100 : 0;
              return (
                <div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Analyst Ratings</div>
                  <div style={{ display: "flex", height: "4px", borderRadius: "2px", overflow: "hidden", marginBottom: "8px", background: "var(--bg-elevated, rgba(255,255,255,0.06))" }}>
                    <div style={{ width: `${bullPct}%`, background: "var(--green)" }} />
                    <div style={{ width: `${holdPct}%`, background: "var(--violet)" }} />
                    <div style={{ width: `${bearPct}%`, background: "var(--red)" }} />
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--green)" }}>Buy {rec.strongBuy + rec.buy}</span>
                    <span style={{ color: "var(--violet)" }}>Hold {rec.hold}</span>
                    <span style={{ color: "var(--red)" }}>Sell {rec.strongSell + rec.sell}</span>
                  </div>
                </div>
              );
            })()}
            {result.priceTarget && (
              <div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Price Target</div>
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
        )}
      </div>

      {/* Your portfolio's personalized call (owned / previously analyzed tickers) */}
      {myPosition && (myPosition.owned || myPosition.rec) && (() => {
        const v = myPosition.rec?.verdict ?? null;
        const vColor = v === "BUY" ? "var(--green)" : (v === "SELL" || v === "TRIM") ? "var(--red)" : "var(--violet)";
        const vBg = v === "BUY" ? "rgba(34,197,94,0.1)" : (v === "SELL" || v === "TRIM") ? "rgba(239,68,68,0.1)" : "rgba(63,174,74,0.12)";
        const vBorder = v === "BUY" ? "rgba(34,197,94,0.22)" : (v === "SELL" || v === "TRIM") ? "rgba(239,68,68,0.22)" : "rgba(63,174,74,0.28)";
        const pid = myPosition.rec?.portfolio_id ?? myPosition.portfolio_id;
        return (
          <div style={{ padding: "10px 18px 0" }}>
            <div style={{ border: "1px solid rgba(14,165,160,0.28)", borderRadius: "var(--radius-lg)", background: "rgba(14,165,160,0.06)", padding: "12px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: myPosition.rec ? "10px" : "4px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--brand-blue)" }}>In your portfolio</span>
                {myPosition.owned && myPosition.shares != null && (
                  <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{myPosition.shares} shares</span>
                )}
                {pid && (
                  <a href={`/portfolios/${pid}`} style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 600, color: "var(--brand-blue)", textDecoration: "none" }}>
                    View analysis →
                  </a>
                )}
              </div>
              {myPosition.rec ? (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ padding: "4px 12px", borderRadius: "var(--radius-full)", background: vBg, border: `1px solid ${vBorder}`, fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: vColor, letterSpacing: "0.04em" }}>
                    {myPosition.rec.verdict}
                  </span>
                  {myPosition.rec.conviction && (
                    <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                      {myPosition.rec.conviction} conviction
                    </span>
                  )}
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                    Atlas&apos;s call for you — tailored to your strategy{myPosition.rec.created_at ? ` · ${new Date(myPosition.rec.created_at).toLocaleDateString()}` : ""}.
                  </span>
                </div>
              ) : (
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                  You hold this. Run an AI analysis on your portfolio for a call tailored to your strategy and cost basis — the take below is a generic market view.
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* AI Verdict */}
      {(aiAnalysisLoading || aiAnalysis || grokLoading || grokAnalysis) && (() => {
        const shown = grokAnalysis ?? aiAnalysis;
        const isGrok = !!grokAnalysis;
        const busy = grokLoading || (aiAnalysisLoading && !aiAnalysis);
        const accent = isGrok ? "oklch(0.62 0.21 295)" : "oklch(0.65 0.18 260)"; // violet for Grok
        const verdictColor = shown?.verdict === "BUY" ? "var(--green)" : shown?.verdict === "SELL" ? "var(--red)" : "var(--violet)";
        const verdictBg    = shown?.verdict === "BUY" ? "rgba(34,197,94,0.1)" : shown?.verdict === "SELL" ? "rgba(239,68,68,0.1)" : "rgba(63,174,74,0.12)";
        const verdictBorder = shown?.verdict === "BUY" ? "rgba(34,197,94,0.22)" : shown?.verdict === "SELL" ? "rgba(239,68,68,0.22)" : "rgba(63,174,74,0.28)";
        const upside = shown?.price_target && result.quote.c > 0
          ? ((shown.price_target - result.quote.c) / result.quote.c) * 100
          : null;
        return (
          <div style={{ padding: "10px 18px 16px" }}>
            <div style={{ border: `1px solid ${busy ? "var(--border-subtle)" : verdictBorder}`, borderRadius: "var(--radius-lg)", background: busy ? "var(--bg-surface)" : verdictBg, overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "12px 16px 0", display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", background: "color-mix(in oklch, " + accent + " 14%, transparent)", border: `1px solid color-mix(in oklch, ${accent} 28%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="8" height="8" viewBox="0 0 20 20" fill="none"><path d="M10 2a7 7 0 014.83 12.01L14 17H6l-.83-2.99A7 7 0 0110 2z" fill={`color-mix(in oklch, ${accent} 20%, transparent)`} stroke={accent} strokeWidth="1.5"/><path d="M8 17h4" stroke={accent} strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: accent, fontFamily: "var(--font-body)" }}>{isGrok ? "Grok · live web + X" : "Quick take · offline model"}</span>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
                  {shown && (
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{new Date(shown.cached_at).toLocaleDateString()}</span>
                  )}
                  {/* Grok deep-dive button — only when not already showing Grok */}
                  {!isGrok && (
                    <button type="button" onClick={runGrokAnalysis} disabled={grokLoading}
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "var(--radius-full)", border: "1px solid color-mix(in oklch, oklch(0.62 0.21 295) 35%, transparent)", background: "color-mix(in oklch, oklch(0.62 0.21 295) 14%, transparent)", color: "oklch(0.68 0.20 295)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: grokLoading ? "wait" : "pointer", fontFamily: "var(--font-body)" }}>
                      <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor"><path d="M11 2L4 11h4l-1 7 7-9h-4l1-7z" /></svg>
                      {grokLoading ? "Searching…" : "Live Grok deep-dive"}
                    </button>
                  )}
                </div>
              </div>

              {busy ? (
                <div style={{ padding: "10px 16px 14px", display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)", fontSize: "12px" }}>
                  <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: accent, opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
                  {grokLoading ? `Grok is researching ${result.ticker} with live web + X search…` : `Analyzing ${result.ticker}...`}
                </div>
              ) : shown && (
                <div style={{ padding: "0 16px 14px" }}>
                  {grokError && (
                    <div style={{ fontSize: "11px", color: "var(--red)", marginBottom: "10px" }}>{grokError}</div>
                  )}
                  {/* Verdict row */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                    <div style={{ padding: "4px 12px", borderRadius: "var(--radius-full)", background: verdictBg, border: `1px solid ${verdictBorder}`, fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: verdictColor, letterSpacing: "0.04em" }}>
                      {shown.verdict}
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                      {shown.conviction} conviction
                    </span>
                    {shown.price_target && (
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                        <div>
                          <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{shown.timeframe} target</div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
                            <span className="num" style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{formatPrice(shown.price_target)}</span>
                            {upside !== null && (
                              <span className="num" style={{ fontSize: "11px", color: upside >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                                {upside >= 0 ? "+" : ""}{upside.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Takeaway */}
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55, margin: "0 0 10px", fontFamily: "var(--font-body)" }}>{shown.takeaway}</p>
                  {/* Bull / Bear */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div>
                      <div style={{ fontSize: "10px", color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "5px" }}>Bull case</div>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{shown.bull_case}</p>
                    </div>
                    <div>
                      <div style={{ fontSize: "10px", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "5px" }}>Bear case</div>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{shown.bear_case}</p>
                    </div>
                  </div>
                  {/* Catalysts + Risks */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px" }}>
                    <div>
                      <div style={{ fontSize: "10px", color: "var(--brand-blue)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "5px" }}>Catalysts</div>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{shown.key_catalysts}</p>
                    </div>
                    <div>
                      <div style={{ fontSize: "10px", color: "var(--violet)", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700, marginBottom: "5px" }}>Key risks</div>
                      <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{shown.key_risks}</p>
                    </div>
                  </div>
                  {isGrok ? (
                    <div style={{ marginTop: "10px", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>Powered by Grok with live web + X search.</div>
                  ) : (
                    <div style={{ marginTop: "10px", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
                      Quick offline-model take — not live and not personalized to your strategy. Tap <strong style={{ color: "oklch(0.68 0.20 295)" }}>Live Grok deep-dive</strong> above for a current, web-searched call.
                    </div>
                  )}
                  {shown && !grokLoading && <AdviceDisclaimer context="analysis" />}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* AI Digest */}
      <div style={{ padding: "4px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>AI Digest</span>
        <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
      </div>
      <div style={{ padding: "10px 18px 20px" }}>
        {digestLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-blue)", opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
            Generating digest for {result.ticker}...
          </div>
        )}
        {digestError && !digestLoading && (
          <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>Unable to generate digest right now.</div>
        )}
        {digest && !digestLoading && (
          <div>
            {digest.profile && (digest.profile.finnhubIndustry || digest.profile.country) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
                {digest.profile.finnhubIndustry && (
                  <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "999px", background: "rgba(14,165,160,0.15)", color: "var(--brand-blue)", border: "1px solid rgba(14,165,160,0.25)" }}>
                    {digest.profile.finnhubIndustry}
                  </span>
                )}
                {digest.profile.country && (
                  <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "999px", background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                    {digest.profile.country}
                  </span>
                )}
                {digest.profile.ipo && (
                  <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "999px", background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                    IPO {digest.profile.ipo.slice(0, 4)}
                  </span>
                )}
              </div>
            )}
            <div style={{ marginBottom: "11px" }}>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Company</div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55 }}>{digest.company_overview}</div>
            </div>
            <div style={{ marginBottom: "11px" }}>
              <div style={{ fontSize: "10px", color: "var(--brand-blue)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Recent Activity</div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55 }}>{digest.news_digest}</div>
            </div>
            {digest.raw_earnings?.length > 0 && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>EPS vs Estimates</div>
                <EarningsChart earnings={digest.raw_earnings} />
                {digest.earnings_snapshot && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "8px" }}>{digest.earnings_snapshot}</div>
                )}
              </div>
            )}
            {digest.raw_metrics && (
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", color: "var(--violet)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Financial Health</div>
                <FinancialMetricsGrid metrics={digest.raw_metrics} />
                {digest.financial_snapshot && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "8px" }}>{digest.financial_snapshot}</div>
                )}
              </div>
            )}
            {/* Analyst consensus removed here — the "Analyst Ratings" breakdown
                above (next to Price Target) already covers this. */}
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Outlook</div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55 }}>{digest.market_outlook}</div>
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>
              AI digest · {new Date(digest.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        )}
      </div>

      {/* News */}
      <div style={{ padding: "4px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>
          {result.news.length > 0 ? `News · ${result.news.length}` : "News"}
        </span>
        <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
      </div>
      {result.news.length === 0 ? (
        <div style={{ padding: "12px 18px", fontSize: "13px", color: "var(--text-muted)" }}>No recent news found.</div>
      ) : (
        result.news.slice(0, 6).map((item, i) => (
          <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: "block", padding: "12px 18px",
              borderBottom: i < Math.min(5, result.news.length - 1) ? "1px solid var(--border-subtle)" : "none",
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

      {/* Reddit Pulse */}
      <div style={{ padding: "14px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>Reddit Pulse</span>
        <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
      </div>
      <div style={{ padding: "10px 18px 18px" }}>
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
              const changeColor = (sp.mention_change_pct ?? 0) >= 0 ? "var(--green)" : "var(--red)";
              const trendLabel = (sp.mention_change_pct ?? 0) >= 10 ? "Trending Up" : (sp.mention_change_pct ?? 0) <= -10 ? "Trending Down" : "Stable";
              const trendColor = (sp.mention_change_pct ?? 0) >= 10 ? "var(--green)" : (sp.mention_change_pct ?? 0) <= -10 ? "var(--red)" : "var(--text-secondary)";
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${trendColor}`, background: `color-mix(in srgb, ${trendColor} 10%, transparent)`, fontSize: "12px", fontWeight: 700, color: trendColor, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      {trendLabel}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {sp.mentions ?? 0} mentions this week
                      <span style={{ color: changeColor, marginLeft: "6px" }}>
                        {(sp.mention_change_pct ?? 0) >= 0 ? "+" : ""}{sp.mention_change_pct ?? 0}% vs yesterday
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "12px" }}>
                    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Mentions</div>
                      <div className="num" style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>{sp.mentions ?? 0}</div>
                    </div>
                    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>24h Change</div>
                      <div className="num" style={{ fontSize: "16px", fontWeight: 600, color: changeColor }}>
                        {(sp.mention_change_pct ?? 0) >= 0 ? "+" : ""}{sp.mention_change_pct ?? 0}%
                      </div>
                    </div>
                    {sp.rank != null && (
                      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Rank</div>
                        <div className="num" style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)" }}>#{sp.rank}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Sentiment analysis requires Reddit API approval · Trend data via ApeWisdom</div>
                </div>
              );
            }

            const scoreColor  = sp.sentiment_score >= 15 ? "var(--green)" : sp.sentiment_score <= -15 ? "var(--red)" : "var(--text-secondary)";
            const subColor    = (s: string) => s === "bullish" ? "var(--green)" : s === "bearish" ? "var(--red)" : s === "mixed" ? "var(--violet)" : "var(--text-muted)";
            const bullishCount = Math.round(sp.post_count * sp.bullish_pct / 100);
            const bearishCount = Math.round(sp.post_count * sp.bearish_pct / 100);
            const neutralCount = sp.post_count - bullishCount - bearishCount;
            return (
              <div>
                {sp.stale && (
                  <div style={{ padding: "5px 10px", background: "rgba(63,174,74,0.12)", border: "1px solid var(--violet-border)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--violet)", marginBottom: "12px" }}>
                    Showing cached data — Reddit unavailable
                  </div>
                )}
                {/* Sentiment badge — lead visual */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ padding: "5px 12px", borderRadius: "6px", border: `1px solid ${scoreColor}`, background: `color-mix(in srgb, ${scoreColor} 10%, transparent)`, fontSize: "12px", fontWeight: 700, color: scoreColor, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {sp.sentiment_label}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {sp.post_count} posts · {sp.ai_powered ? "AI analyzed" : "Keyword"}
                  </div>
                </div>
                {/* Positive / negative count */}
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "10px", fontFamily: "var(--font-mono)" }}>
                  <span style={{ color: "var(--green)" }}>{bullishCount} positive</span>
                  {" · "}
                  <span style={{ color: "var(--red)" }}>{bearishCount} negative</span>
                  {" · "}
                  <span style={{ color: "var(--text-muted)" }}>{neutralCount} neutral</span>
                </div>
                {/* Sentiment bar */}
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", gap: "2px", height: "6px", borderRadius: "3px", overflow: "hidden", marginBottom: "5px" }}>
                    <div style={{ width: `${sp.bullish_pct}%`, background: "var(--green)", flexShrink: 0 }} />
                    <div style={{ width: `${sp.neutral_pct}%`, background: "var(--border-subtle)", flexShrink: 0 }} />
                    <div style={{ width: `${sp.bearish_pct}%`, background: "var(--red)", flexShrink: 0 }} />
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "10px", fontFamily: "var(--font-mono)" }}>
                    <span style={{ color: "var(--green)" }}>{sp.bullish_pct}% bull</span>
                    <span style={{ color: "var(--text-muted)" }}>{sp.neutral_pct}% neutral</span>
                    <span style={{ color: "var(--red)" }}>{sp.bearish_pct}% bear</span>
                  </div>
                </div>
                {sp.summary && (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px", lineHeight: 1.5 }}>{sp.summary}</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                  {[
                    { label: "Conviction", value: sp.conviction_score, color: sp.conviction_score >= 60 ? "var(--green)" : sp.conviction_score >= 35 ? "var(--violet)" : "var(--text-secondary)" },
                    { label: "Hype Risk",  value: sp.hype_score,       color: sp.hype_score >= 65 ? "var(--red)" : sp.hype_score >= 40 ? "var(--violet)" : "var(--text-secondary)" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", padding: "8px 10px" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>{label}</div>
                      <div className="num" style={{ fontSize: "16px", fontWeight: 600, color }}>{value}<span style={{ fontSize: "10px", color: "var(--text-muted)" }}>/100</span></div>
                    </div>
                  ))}
                </div>
                {(sp.top_bullish_themes.length > 0 || sp.top_bearish_themes.length > 0) && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                    {sp.top_bullish_themes.length > 0 && (
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Bullish</div>
                        {sp.top_bullish_themes.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px", lineHeight: 1.3 }}>· {t}</div>
                        ))}
                      </div>
                    )}
                    {sp.top_bearish_themes.length > 0 && (
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Bearish</div>
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
                        <div style={{ fontSize: "10px", color: "var(--violet)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Risks</div>
                        {sp.top_risks.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>· {t}</div>
                        ))}
                      </div>
                    )}
                    {sp.top_catalysts.length > 0 && (
                      <div>
                        <div style={{ fontSize: "10px", color: "var(--brand-blue)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Catalysts</div>
                        {sp.top_catalysts.slice(0, 3).map((t, i) => (
                          <div key={i} style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>· {t}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {sp.subreddit_breakdown.length > 0 && (
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>By Subreddit</div>
                    {sp.subreddit_breakdown.map((sub) => (
                      <div key={sub.subreddit} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>r/{sub.subreddit}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{sub.post_count} posts</span>
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

      {/* Congress trades for this ticker */}
      <CongressTickerCard ticker={result.ticker} />

      {/* Insider Activity */}
      <div style={{ padding: "14px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>Insider Activity</span>
        <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
      </div>
      <div style={{ padding: "14px 18px", paddingBottom: "40px" }}>
        {insiderLoading ? (
          <div style={{ textAlign: "center", padding: "28px 0", color: "var(--text-muted)", fontSize: "13px" }}>
            Loading insider data...
          </div>
        ) : !insiderData || insiderData.transactions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>No insider transactions found</div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Insider data comes from SEC Form 4 filings (open-market transactions only, last 90 days). Crypto and foreign-listed stocks are not covered.
            </div>
          </div>
        ) : (() => {
          const { transactions, netBuys, netSells, signal } = insiderData;
          const signalColor = signal === "buy" ? "var(--green)" : signal === "sell" ? "var(--red)" : "var(--text-muted)";
          const signalLabel = signal === "buy" ? "Net Buying" : signal === "sell" ? "Net Selling" : "Mixed Activity";
          return (
            <div>
              <div style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 12px", marginBottom: "14px",
                background: "var(--bg-surface)", border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-md)",
              }}>
                <div style={{
                  padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                  fontFamily: "var(--font-mono)", letterSpacing: "0.04em",
                  background: signal === "buy" ? "rgba(34,197,94,0.12)" : signal === "sell" ? "rgba(239,68,68,0.12)" : "var(--bg-elevated)",
                  color: signalColor,
                }}>
                  {signal === "buy" ? "INS▲" : signal === "sell" ? "INS▼" : "INS—"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: signalColor }}>{signalLabel}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px" }}>
                    {netBuys > 0 && <span style={{ color: "var(--green)", marginRight: "10px" }}>{netBuys} purchase{netBuys !== 1 ? "s" : ""}</span>}
                    {netSells > 0 && <span style={{ color: "var(--red)" }}>{netSells} sale{netSells !== 1 ? "s" : ""}</span>}
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "6px" }}>Recent Transactions</div>
                {transactions.map((tx, i) => {
                  const isBuy = tx.transactionCode === "P";
                  const value = tx.share * tx.transactionPrice;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "8px 0",
                      borderBottom: i < transactions.length - 1 ? "1px solid var(--border-subtle)" : "none",
                    }}>
                      <div style={{
                        padding: "2px 6px", borderRadius: "3px", fontSize: "10px", fontWeight: 700,
                        fontFamily: "var(--font-mono)", flexShrink: 0,
                        background: isBuy ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        color: isBuy ? "var(--green)" : "var(--red)",
                      }}>
                        {isBuy ? "BUY" : "SELL"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tx.name}
                        </div>
                        <div className="num" style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "1px" }}>
                          {Math.abs(tx.share).toLocaleString()} shares
                          {tx.transactionPrice > 0 && (
                            <span style={{ marginLeft: "6px" }}>
                              @ ${tx.transactionPrice.toFixed(2)}
                              {value > 0 && (
                                <span style={{ color: "var(--text-secondary)", marginLeft: "4px" }}>
                                  (${value >= 1_000_000_000 ? `${(value / 1_000_000_000).toFixed(2)}B` : value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(0)}K` : value.toFixed(0)})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0, fontFamily: "var(--font-mono)" }}>
                        {new Date(tx.transactionDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: "8px 10px", background: "var(--bg-surface)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Buying is a stronger signal than selling. Insiders sell for many reasons (diversification, taxes, RSU vesting) but buy for only one.
              </div>
              <div style={{ marginTop: "8px", fontSize: "10px", color: "var(--text-muted)" }}>
                Source: SEC Form 4 filings via Finnhub · Open-market transactions only · Last 90 days
              </div>
            </div>
          );
        })()}
      </div>

    </>
  );
}

// ─── Portfolio News ───────────────────────────────────────────────────────────

type PortfolioNewsItem = { ticker: string; headline: string; source: string; url: string; datetime: number };

function PortfolioNewsSection({
  items, loading, onTickerClick,
}: {
  items: PortfolioNewsItem[];
  loading: boolean;
  onTickerClick: (ticker: string) => void;
}) {
  if (!loading && items.length === 0) return null;
  return (
    <div style={{ marginBottom: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)" }}>
          Your Portfolio News
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>from your holdings</span>
      </div>
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1px", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ padding: "11px 14px", background: "var(--bg-elevated)", display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <div className="bt-skeleton" style={{ width: "40px", height: "18px", borderRadius: "4px", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px" }}>
                <div className="bt-skeleton" style={{ width: "80%", height: "10px", borderRadius: "3px" }} />
                <div className="bt-skeleton" style={{ width: "40%", height: "9px", borderRadius: "3px" }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
          {items.map((item, i) => (
            <div key={i} style={{
              display: "flex", gap: "10px", alignItems: "flex-start",
              padding: "11px 14px",
              background: "var(--bg-elevated)",
              borderBottom: i < items.length - 1 ? "1px solid var(--border-subtle)" : "none",
            }}>
              <button
                onClick={() => onTickerClick(item.ticker)}
                style={{
                  padding: "2px 7px", fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)",
                  background: "var(--bg-surface)", border: "1px solid var(--card-border)",
                  borderRadius: "4px", color: "var(--brand-blue)", cursor: "pointer",
                  flexShrink: 0, letterSpacing: "0.03em",
                  transition: "background 120ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--card-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-surface)"; }}
              >
                {item.ticker}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a
                  href={item.url} target="_blank" rel="noopener noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <div style={{
                    fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4,
                    overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    transition: "color 100ms ease",
                  }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--brand-blue)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                  >
                    {item.headline}
                  </div>
                </a>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>
                  {item.source} · {timeAgo(item.datetime)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

  const [portfolioNews, setPortfolioNews]         = useState<PortfolioNewsItem[]>([]);
  const [portfolioNewsLoading, setPortfolioNewsLoading] = useState(true);

  const [activeFilter, setActiveFilter] = useState<FilterId>("all");

  const [scenarioOverlayResult, setScenarioOverlayResult]   = useState<SearchResult | null>(null);
  const [scenarioOverlayLoading, setScenarioOverlayLoading] = useState(false);

  const topRef          = useRef<HTMLDivElement>(null);
  const inflightRef     = useRef<string | null>(null);
  const overlayInflight = useRef<string | null>(null);
  const searchParams = useSearchParams();

  // Auto-search when navigated here with ?ticker=AAPL (e.g. from community portfolio pages)
  useEffect(() => {
    const ticker = searchParams.get("ticker");
    if (ticker) doSearch(ticker);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    fetch("/api/research/portfolio-news")
      .then((r) => r.json())
      .then((d) => setPortfolioNews(d.items ?? []))
      .catch(() => {})
      .finally(() => setPortfolioNewsLoading(false));
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

  function doScenarioSearch(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t || overlayInflight.current === t) return;
    overlayInflight.current = t;
    setScenarioOverlayLoading(true);
    setScenarioOverlayResult(null);
    trackEvent(t, "scenario_ticker_click");
    fetch(`/api/research/search?ticker=${encodeURIComponent(t)}`)
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((d) => { setScenarioOverlayResult(d); trackEvent(t, "stock_detail_view"); })
      .catch(() => { setScenarioOverlayResult(null); })
      .finally(() => { setScenarioOverlayLoading(false); overlayInflight.current = null; });
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); doSearch(query); }
  function clearSearch() {
    setQuery("");
    setSearchResult(null);
    setSearchError(null);
  }

  const nameMap = new Map<string, string>();
  for (const section of screener) for (const t of section.tickers) nameMap.set(t.ticker, t.name);

  const showScenarios    = activeFilter === "scenarios";
  const showPopular      = !showScenarios && (activeFilter === "all" || activeFilter === "popular");
  const screenerSections = showScenarios || activeFilter === "popular" ? [] : activeFilter === "all"
    ? screener
    : screener.filter((s) => s.id === activeFilter);

  return (
    <div ref={topRef} style={{ maxWidth: "900px" }}>
      <PageTutorial tutorialId="research" />

      {/* Market hours notice */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px", padding: "7px 12px", borderRadius: "var(--radius-md)", background: "var(--card-bg)", border: "1px solid var(--card-border)" }}>
        <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Market data updates during US trading hours (Mon–Fri, 9:30am–4pm ET). Prices and analyst data may be delayed outside these hours.
        </span>
      </div>

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
              e.target.style.boxShadow   = "0 0 0 3px rgba(14,165,160,0.1)";
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
        className="bt-tabs-scroll research-filter-chips"
      >
        {FILTER_CHIPS.map((chip) => (
          <FilterChip
            key={chip.id}
            label={chip.label}
            active={activeFilter === chip.id}
            onClick={() => setActiveFilter(chip.id)}
            accent={chip.id === "scenarios" ? "purple" : undefined}
          />
        ))}
      </div>

      {/* If/Then Macro Plays */}
      {showScenarios && (
        <ScenariosPanel onTickerClick={doScenarioSearch} />
      )}

      {/* Search feedback */}
      {!showScenarios && searching && (
        <div style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "12px" }}>
          Searching {query}...
        </div>
      )}
      {!showScenarios && searchError && (
        <div style={{ padding: "11px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", color: "var(--red)", fontSize: "13px", marginBottom: "18px" }}>
          {searchError}
        </div>
      )}

      {/* Detail view + mobile backdrop */}
      {!showScenarios && searchResult && !searching && (
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

      {/* Scenario stock overlay — shown over the If/Then panel without leaving it */}
      {(scenarioOverlayResult || scenarioOverlayLoading) && (
        <>
          <div
            onClick={() => setScenarioOverlayResult(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(2px)",
              zIndex: 80,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(680px, calc(100vw - 32px))",
              maxHeight: "calc(100dvh - 64px)",
              overflowY: "auto",
              background: "var(--bg-elevated)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
              zIndex: 81,
            }}
          >
            {scenarioOverlayLoading && (
              <div style={{
                padding: "48px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                color: "var(--text-muted)",
                fontSize: "13px",
              }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="10">
                    <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" />
                  </circle>
                </svg>
                Loading...
              </div>
            )}
            {scenarioOverlayResult && (
              <DetailView
                result={scenarioOverlayResult}
                portfolios={portfolios}
                onClose={() => setScenarioOverlayResult(null)}
              />
            )}
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
                <StockCard
                  key={t.ticker}
                  t={{ ...t, name: t.name || nameMap.get(t.ticker) || t.ticker }}
                  onClick={(ticker) => { setQuery(ticker); trackEvent(ticker, "stock_card_click"); doSearch(ticker); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Portfolio news */}
      {!showScenarios && (activeFilter === "all" || activeFilter === "popular") && (
        <PortfolioNewsSection
          items={portfolioNews}
          loading={portfolioNewsLoading}
          onTickerClick={(ticker) => { setQuery(ticker); doSearch(ticker); }}
        />
      )}

      {/* Congress is Trading — free STOCK Act disclosures, near the top of the default feed */}
      <CongressSection
        active={!showScenarios && activeFilter === "all"}
        onTickerClick={(ticker) => { setQuery(ticker); trackEvent(ticker, "congress_ticker_click"); doSearch(ticker); }}
      />

      {/* Screener sections */}
      {!showScenarios && screenerLoading ? (
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
