"use client";

import { useState, useTransition } from "react";
import { EditHoldingForm, DeleteHoldingButton, UpdateNavButton } from "./add-holding-form";
import { HoldingLots } from "./holding-lots";
import type { HoldingLot } from "./holding-lots";
import StockChart from "@/app/components/stock-chart";
import FundamentalsPanel from "./fundamentals-panel";
import { TickerLookupProvider, useTickerLookup } from "@/app/components/ticker-quick-look";

// Opens the ticker quick-look popup in place (no navigation). Must render inside
// a TickerLookupProvider (we wrap the table below).
function ResearchQuickLook({ ticker }: { ticker: string }) {
  const { open } = useTickerLookup();
  return (
    <button
      type="button"
      onClick={() => open(ticker)}
      className="text-xs transition"
      style={{ color: "var(--text-muted)", opacity: 0.6, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
      title={`Quick research for ${ticker}`}
    >
      Research
    </button>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ValuedHolding = {
  id: string;
  ticker: string;
  company_name: string | null;
  asset_type: string | null;
  shares_number: number;
  average_cost_basis_number: number | null;
  current_price: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
  weight_pct: number | null;
  has_live_price?: boolean;
  manual_price?: number | string | null;
  manual_price_updated_at?: string | null;
  notes?: string | null;
  opened_at?: string | null;
};

type MarketData = {
  news: { id: number; headline: string; source: string; url: string; datetime: number }[];
  recommendation: {
    buy: number; hold: number; sell: number;
    strongBuy: number; strongSell: number; period: string;
  } | null;
  priceTarget: {
    targetMean: number; targetLow: number; targetHigh: number;
  } | null;
  profile: { name: string; logo: string; weburl: string; marketCap: number | null; industry: string | null } | null;
  metrics: { peRatio: number | null; weekHigh52: number | null; weekLow52: number | null } | null;
};

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

type HoldingsTableProps = {
  portfolioId: string;
  holdings: ValuedHolding[];
  lots?: HoldingLot[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatPrice(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(unixTimestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - unixTimestamp;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EarningsChart({ earnings }: { earnings: RawEarning[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const valid = [...earnings].reverse().filter((e) => e.actual != null || e.estimate != null);
  if (valid.length === 0) return null;
  const posVals = valid.flatMap((e) => [e.actual, e.estimate]).filter((v): v is number => v != null && v > 0);
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
        .bt-bar-r { transform-origin: bottom center; animation: bt-bar-rise 0.5s cubic-bezier(0.22,1,0.36,1) both; }
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
          <div style={{ width: `${yAxisW}px`, flexShrink: 0, position: "relative", height: `${chartH}px` }}>
            {gridLines.map((g, gi) => (
              <div key={gi} style={{ position: "absolute", bottom: `${g.pct}%`, right: 0, transform: "translateY(50%)", fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {g.label}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: "relative", height: `${chartH}px` }}>
            {gridLines.map((g, gi) => (
              <div key={gi} style={{ position: "absolute", left: 0, right: 0, bottom: `${g.pct}%`, height: "1px", background: g.pct === 100 ? "var(--border-subtle)" : "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
            ))}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: "4px" }}>
              {valid.map((e, i) => {
                const actualH = e.actual != null && e.actual > 0 ? Math.max(3, (e.actual / maxVal) * chartH) : 0;
                const estH = e.estimate != null && e.estimate > 0 ? Math.max(3, (e.estimate / maxVal) * chartH) : 0;
                const barColor = e.beat === true ? "var(--green)" : e.beat === false ? "var(--red)" : "var(--brand-blue)";
                const isHovered = hoverIdx === i;
                const isDimmed = hoverIdx !== null && !isHovered;
                return (
                  <div key={i} style={{ flex: 1, height: "100%", position: "relative" }} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)}>
                    {isHovered && (
                      <div style={{ position: "absolute", bottom: `${Math.max(actualH, estH) + 10}px`, left: "50%", transform: "translateX(-50%)", background: "var(--bg-elevated)", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", padding: "5px 8px", zIndex: 20, whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(0,0,0,0.45)", pointerEvents: "none" }}>
                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "4px", textAlign: "center" }}>{e.quarter}</div>
                        {e.estimate != null && <div style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Est: {fmtEps(e.estimate)}</div>}
                        {e.actual != null && <div style={{ fontSize: "10px", fontWeight: 600, color: barColor, fontFamily: "var(--font-mono)" }}>Act: {fmtEps(e.actual)}{e.beat === true ? " ✓" : e.beat === false ? " ✗" : ""}</div>}
                      </div>
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "flex-end", gap: "2px", opacity: isDimmed ? 0.25 : 1, filter: isHovered ? "brightness(1.5) saturate(1.2)" : "none", transition: "opacity 180ms ease, filter 180ms ease" }}>
                      {estH > 0 && <div className="bt-bar-r" style={{ width: "11px", height: `${estH}px`, background: "rgba(255,255,255,0.22)", borderRadius: "2px 2px 0 0", animationDelay: `${i * 0.07}s` }} />}
                      {actualH > 0 && <div className="bt-bar-r" style={{ width: "11px", height: `${actualH}px`, background: barColor, borderRadius: "2px 2px 0 0", animationDelay: `${i * 0.07 + 0.05}s` }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px", marginTop: "6px", paddingLeft: `${yAxisW + 8}px` }}>
          {valid.map((e, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <span style={{ fontSize: "10px", color: hoverIdx === i ? "var(--text-primary)" : "var(--text-muted)", fontWeight: hoverIdx === i ? 600 : 400, transition: "color 150ms ease" }}>{e.quarter}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function FinancialMetricsGrid({ metrics }: { metrics: RawMetrics }) {
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtSignedPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
  const items: { label: string; value: string; color: string }[] = [];

  if (metrics.netMarginTTM != null) {
    const v = metrics.netMarginTTM * 100;
    items.push({ label: "Net Margin", value: fmtPct(v), color: v >= 20 ? "var(--green)" : v >= 8 ? "var(--amber)" : "var(--red)" });
  }
  if (metrics.revenueGrowth3Y != null) {
    const v = metrics.revenueGrowth3Y;
    items.push({ label: "Rev Growth 3Y", value: fmtSignedPct(v), color: v >= 10 ? "var(--green)" : v >= 0 ? "var(--amber)" : "var(--red)" });
  }
  if (metrics.epsGrowth3Y != null) {
    const v = metrics.epsGrowth3Y;
    items.push({ label: "EPS Growth 3Y", value: fmtSignedPct(v), color: v >= 10 ? "var(--green)" : v >= 0 ? "var(--amber)" : "var(--red)" });
  }
  if (metrics.roeTTM != null) {
    const v = metrics.roeTTM;
    items.push({ label: "ROE", value: fmtPct(v), color: v >= 15 ? "var(--green)" : v >= 5 ? "var(--amber)" : "var(--red)" });
  }
  if (metrics.currentRatioAnnual != null) {
    const v = metrics.currentRatioAnnual;
    items.push({ label: "Current Ratio", value: v.toFixed(2), color: v >= 1.5 ? "var(--green)" : v >= 1 ? "var(--amber)" : "var(--red)" });
  }
  if (metrics.debtToEquityAnnual != null) {
    const v = metrics.debtToEquityAnnual;
    items.push({ label: "Debt/Equity", value: v.toFixed(2), color: v <= 1 ? "var(--green)" : v <= 2 ? "var(--amber)" : "var(--red)" });
  }

  if (items.length === 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
      {items.map((item, i) => (
        <div key={i} style={{ padding: "8px 10px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)" }}>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>{item.label}</div>
          <div className="num" style={{ fontSize: "13px", fontWeight: 600, color: item.color, lineHeight: 1 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function AnalystConsensusBar({ rec }: { rec: RawRecommendation }) {
  const sb = rec.strongBuy ?? 0;
  const b  = rec.buy ?? 0;
  const h  = rec.hold ?? 0;
  const s  = rec.sell ?? 0;
  const ss = rec.strongSell ?? 0;
  const total = sb + b + h + s + ss;
  if (total === 0) return null;

  const bullCount = sb + b;
  const bearCount = s + ss;
  const consensusLabel = bullCount > h && bullCount > bearCount ? "Bullish" : bearCount > bullCount ? "Bearish" : "Neutral";
  const consensusColor = bullCount > bearCount ? "var(--green)" : bearCount > bullCount ? "var(--red)" : "var(--amber)";
  const segments = [
    { count: sb, color: "var(--green)" }, { count: b, color: "#4ade80" },
    { count: h, color: "#f59e0b" }, { count: s, color: "var(--red)" }, { count: ss, color: "var(--red)" },
  ].filter(seg => seg.count > 0);

  return (
    <div>
      <div style={{ display: "flex", height: "7px", borderRadius: "4px", overflow: "hidden", gap: "1px" }}>
        {segments.map((seg, i) => <div key={i} style={{ flex: seg.count, background: seg.color, minWidth: "2px" }} />)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px", fontSize: "10px" }}>
        <span style={{ color: "var(--green)" }}>{bullCount} Buy</span>
        <span style={{ color: consensusColor, fontWeight: 600 }}>{consensusLabel} · {total} analysts</span>
        <span style={{ color: "var(--red)" }}>{bearCount} Sell</span>
      </div>
    </div>
  );
}

function InsiderPanel({ ticker, data }: { ticker: string; data: InsiderData }) {
  const { transactions, netBuys, netSells, signal } = data;

  if (transactions.length === 0) {
    return (
      <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 18px" }}>
        <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: "4px" }}>Insider Activity</p>
        <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>No open-market transactions in the last 90 days for {ticker}.</p>
      </div>
    );
  }

  const signalColor = signal === "buy" ? "var(--green)" : signal === "sell" ? "var(--red)" : "var(--text-muted)";
  const signalBg    = signal === "buy" ? "rgba(0,211,149,0.1)" : signal === "sell" ? "rgba(239,68,68,0.1)" : "var(--bg-surface)";
  const signalBorder = signal === "buy" ? "rgba(0,211,149,0.25)" : signal === "sell" ? "rgba(239,68,68,0.25)" : "var(--card-border)";
  const signalLabel = signal === "buy" ? "Net Buying" : signal === "sell" ? "Net Selling" : "Mixed";

  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "12px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>Insider Activity · 90 days</span>
        <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: signalBg, border: `1px solid ${signalBorder}`, color: signalColor }}>
          {signalLabel} · {netBuys}B / {netSells}S
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {transactions.slice(0, 6).map((tx, i) => {
          const isBuy = tx.transactionCode === "P";
          const value = tx.transactionPrice > 0 ? Math.abs(tx.change) * tx.transactionPrice : null;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, background: isBuy ? "var(--green)" : "var(--red)" }} />
              <span style={{ fontWeight: 600, width: "32px", flexShrink: 0, color: isBuy ? "var(--green)" : "var(--red)" }}>{isBuy ? "BUY" : "SELL"}</span>
              <span style={{ color: "var(--text-secondary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.name}</span>
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                {Math.abs(tx.change).toLocaleString()} shares{value != null && ` · $${(value / 1000).toFixed(0)}k`}
              </span>
              <span style={{ color: "var(--text-muted)", flexShrink: 0, fontSize: "10px" }}>{tx.transactionDate}</span>
            </div>
          );
        })}
      </div>
      {transactions.length > 6 && (
        <p style={{ marginTop: "8px", fontSize: "10px", color: "var(--text-muted)" }}>+{transactions.length - 6} more transactions · SEC Form 4</p>
      )}
    </div>
  );
}

// ─── Main Table ───────────────────────────────────────────────────────────────

export default function HoldingsTable({ portfolioId, holdings, lots = [] }: HoldingsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lotsId, setLotsId] = useState<string | null>(null);
  const [fundamentalsId, setFundamentalsId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [insiderData, setInsiderData] = useState<Record<string, InsiderData>>({});
  const [digestData, setDigestData] = useState<Record<string, DigestResult>>({});
  const [socialData, setSocialData] = useState<Record<string, RedditPulse | null>>({});
  const [socialErrors, setSocialErrors] = useState<Record<string, string>>({});
  const [socialShowSources, setSocialShowSources] = useState<Record<string, boolean>>({});
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [digestLoadingTicker, setDigestLoadingTicker] = useState<string | null>(null);
  const [socialLoadingTicker, setSocialLoadingTicker] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleExpand(holding: ValuedHolding) {
    if (expandedId === holding.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(holding.id);

    const ticker = holding.ticker;

    if (!marketData[ticker]) {
      setLoadingTicker(ticker);
      Promise.all([
        fetch(`/api/market-data/${ticker}`),
        fetch(`/api/insider/${ticker}`),
      ]).then(async ([mktRes, insRes]) => {
        if (mktRes.ok) {
          const data = await mktRes.json();
          setMarketData((prev) => ({ ...prev, [ticker]: data }));
        }
        if (insRes.ok) {
          const data = await insRes.json();
          setInsiderData((prev) => ({ ...prev, [ticker]: data }));
        }
      }).catch(() => {}).finally(() => setLoadingTicker(null));
    }

    if (!digestData[ticker]) {
      setDigestLoadingTicker(ticker);
      fetch("/api/research/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          company_name: holding.company_name ?? ticker,
          price: holding.current_price ?? 0,
          change_pct: 0,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) setDigestData((prev) => ({ ...prev, [ticker]: d as DigestResult }));
        })
        .catch(() => {})
        .finally(() => setDigestLoadingTicker(null));
    }

    if (!(ticker in socialData) && !socialErrors[ticker]) {
      setSocialLoadingTicker(ticker);
      const company = encodeURIComponent(holding.company_name ?? ticker);
      fetch(`/api/social-pulse/${ticker}?company=${company}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.status === "unavailable" || d.status === "no_credentials" || d.status === "disabled" || d.error) {
            setSocialErrors((prev) => ({ ...prev, [ticker]: d.message ?? d.error ?? "Reddit Pulse unavailable." }));
          } else {
            setSocialData((prev) => ({ ...prev, [ticker]: d as RedditPulse }));
          }
        })
        .catch(() => setSocialErrors((prev) => ({ ...prev, [ticker]: "Failed to load Reddit Pulse." })))
        .finally(() => setSocialLoadingTicker(null));
    }
  }

  if (holdings.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-white/5 bg-white/2 p-5 text-center">
        <p className="text-sm font-medium text-white">No holdings yet</p>
        <p className="mt-1 text-xs text-slate-500">Add your first position using the button above.</p>
      </div>
    );
  }

  return (
    <TickerLookupProvider>
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/5">
      <table className="min-w-full divide-y divide-white/5">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            <th className="bg-white/3 px-3 py-3">Ticker</th>
            <th className="bg-white/3 px-3 py-3 hidden sm:table-cell">Company</th>
            <th className="bg-white/3 px-3 py-3">Shares</th>
            <th className="bg-white/3 px-3 py-3 hidden md:table-cell">Avg Cost</th>
            <th className="bg-white/3 px-3 py-3 hidden md:table-cell">Price</th>
            <th className="bg-white/3 px-3 py-3">Value</th>
            <th className="bg-white/3 px-3 py-3">P&L</th>
            <th className="bg-white/3 px-3 py-3 hidden lg:table-cell">Weight</th>
            <th className="bg-white/3 px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {holdings.map((holding) => (
            <>
              <tr key={holding.id} className="text-sm transition hover:bg-white/2">
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => handleExpand(holding)}
                    className="flex items-center gap-1.5 font-bold text-white hover:text-blue-300 transition"
                  >
                    {holding.ticker}
                    {insiderData[holding.ticker]?.signal === "buy" && (
                      <span title="Net insider buying (90d)" className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1 leading-4">
                        INS▲
                      </span>
                    )}
                    {insiderData[holding.ticker]?.signal === "sell" && (
                      <span title="Net insider selling (90d)" className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1 leading-4">
                        INS▼
                      </span>
                    )}
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-3 w-3 text-slate-600 transition-transform ${expandedId === holding.id ? "rotate-180" : ""}`}
                    >
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>
                </td>
                <td className="px-3 py-3 text-slate-400 hidden sm:table-cell">{holding.company_name || "—"}</td>
                <td className="px-3 py-3 text-slate-300">
                  {holding.shares_number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                </td>
                <td className="px-3 py-3 text-slate-300 hidden md:table-cell">{formatMoney(holding.average_cost_basis_number)}</td>
                <td className="px-3 py-3 text-slate-300 hidden md:table-cell">
                  {holding.asset_type === "manual" ? (
                    holding.current_price !== null ? (
                      (() => {
                        const days = holding.manual_price_updated_at
                          ? Math.floor((Date.now() - new Date(holding.manual_price_updated_at).getTime()) / 86_400_000)
                          : null;
                        const ageLabel = days === null ? "" : days <= 0 ? " · updated today" : days === 1 ? " · updated 1d ago" : ` · updated ${days}d ago`;
                        const stale = days !== null && days > 45;
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            {formatMoney(holding.current_price)}
                            <span
                              title={`Manual NAV — non-tradeable funds have no live price, so you set this yourself${days !== null ? ` (last updated ${days <= 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`})` : ""}. Use Update NAV to refresh it.`}
                              style={{ display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: 600, color: stale ? "var(--amber)" : "var(--text-tertiary)", background: stale ? "rgba(245,158,11,0.1)" : "var(--card-bg)", border: `1px solid ${stale ? "rgba(245,158,11,0.25)" : "var(--card-border)"}`, borderRadius: "4px", padding: "1px 6px", cursor: "help", fontFamily: "var(--font-body)" }}
                            >
                              NAV{ageLabel}
                            </span>
                          </span>
                        );
                      })()
                    ) : (
                      <span title="No NAV set. Use Update NAV to enter the current price per share." style={{ display: "inline-flex", alignItems: "center", fontSize: "10px", fontWeight: 600, color: "var(--amber)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "4px", padding: "1px 6px", cursor: "help", fontFamily: "var(--font-body)" }}>
                        No NAV
                      </span>
                    )
                  ) : holding.current_price !== null
                    ? formatMoney(holding.current_price)
                    : (
                      <span
                        title="BuyTune couldn't find a live price for this ticker. It's excluded from your portfolio total until a price is available. Check the ticker symbol is correct."
                        style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 600, color: "var(--amber)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "4px", padding: "1px 6px", cursor: "help", fontFamily: "var(--font-body)" }}
                      >
                        No price
                      </span>
                    )
                  }
                </td>
                <td className="px-3 py-3 font-medium" style={{ color: holding.market_value === null ? "var(--text-muted)" : "var(--text-primary)" }}>
                  {holding.market_value !== null
                    ? formatMoney(holding.market_value)
                    : <span title="Excluded from portfolio total — no live price" style={{ fontSize: "11px", color: "var(--text-muted)" }}>—</span>
                  }
                </td>
                <td className={`px-3 py-3 font-medium ${
                  holding.unrealized_pl !== null && holding.unrealized_pl > 0 ? "text-emerald-400"
                  : holding.unrealized_pl !== null && holding.unrealized_pl < 0 ? "text-red-400"
                  : "text-slate-400"
                }`}>
                  <div>{formatMoney(holding.unrealized_pl)}</div>
                  <div className="text-[10px] opacity-70">{formatPercent(holding.unrealized_pl_pct)}</div>
                </td>
                <td className="px-3 py-3 text-slate-400 hidden lg:table-cell">{formatPercent(holding.weight_pct)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === holding.id ? null : holding.id)}
                      className="text-xs text-blue-400/60 transition hover:text-blue-400"
                    >
                      {editingId === holding.id ? "Cancel" : "Edit"}
                    </button>
                    {holding.asset_type === "manual" && (
                      <UpdateNavButton
                        holdingId={holding.id}
                        portfolioId={portfolioId}
                        currentNav={holding.manual_price != null ? Number(holding.manual_price) : (holding.current_price ?? null)}
                      />
                    )}
                    {(() => {
                      const holdingLotCount = lots.filter((l) => l.holding_id === holding.id).length;
                      const isOpen = lotsId === holding.id;
                      return (
                        <button
                          type="button"
                          onClick={() => setLotsId(isOpen ? null : holding.id)}
                          className="text-xs transition"
                          style={{ color: isOpen ? "var(--brand-blue)" : "var(--text-muted)", opacity: isOpen ? 1 : 0.6 }}
                          title="View and edit purchase lots"
                        >
                          Lots{holdingLotCount > 0 ? ` (${holdingLotCount})` : ""}
                        </button>
                      );
                    })()}
                    {holding.asset_type !== "manual" && (
                      <ResearchQuickLook ticker={holding.ticker} />
                    )}
                    {(holding.asset_type === "stock" || holding.asset_type == null) && (() => {
                      const isOpen = fundamentalsId === holding.id;
                      return (
                        <button
                          type="button"
                          onClick={() => setFundamentalsId(isOpen ? null : holding.id)}
                          className="text-xs transition"
                          style={{ color: isOpen ? "var(--brand-blue)" : "var(--text-muted)", opacity: isOpen ? 1 : 0.6 }}
                          title="View SEC EDGAR financial data"
                        >
                          Financials
                        </button>
                      );
                    })()}
                    <DeleteHoldingButton holdingId={holding.id} portfolioId={portfolioId} ticker={holding.ticker} />
                  </div>
                </td>
              </tr>

              {/* Detail panel */}
              {expandedId === holding.id && (
                <tr key={`market-${holding.id}`}>
                  <td colSpan={9} className="p-0">
                    {loadingTicker === holding.ticker && !marketData[holding.ticker] ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 18px", fontSize: "12px", color: "var(--text-muted)", background: "var(--bg-surface)" }}>
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading data for {holding.ticker}...
                      </div>
                    ) : marketData[holding.ticker] ? (
                      <div style={{ background: "var(--bg-elevated)", borderTop: "1px solid var(--border-subtle)" }}>

                        {/* Key metrics grid */}
                        {(() => {
                          const md = marketData[holding.ticker];
                          const hasMetrics = md.profile?.marketCap || md.profile?.industry || md.metrics?.peRatio || md.metrics?.weekHigh52;
                          if (!hasMetrics) return null;
                          return (
                            <div style={{ padding: "14px 18px 0" }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "1px", background: "var(--border-subtle)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden", marginBottom: "14px" }}>
                                {md.profile?.marketCap && (
                                  <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Mkt Cap</div>
                                    <div className="num" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                                      {md.profile.marketCap >= 1_000_000
                                        ? `$${(md.profile.marketCap / 1_000_000).toFixed(2)}T`
                                        : md.profile.marketCap >= 1_000
                                        ? `$${(md.profile.marketCap / 1_000).toFixed(1)}B`
                                        : `$${Math.round(md.profile.marketCap)}M`}
                                    </div>
                                  </div>
                                )}
                                {md.metrics?.peRatio && md.metrics.peRatio > 0 && (
                                  <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>P/E (TTM)</div>
                                    <div className="num" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{md.metrics.peRatio.toFixed(1)}x</div>
                                  </div>
                                )}
                                {md.metrics?.weekHigh52 && md.metrics?.weekLow52 && (
                                  <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>52-Wk Range</div>
                                    <div className="num" style={{ lineHeight: 1.45 }}>
                                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--red)" }}>{formatPrice(md.metrics.weekLow52)}</div>
                                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)" }}>{formatPrice(md.metrics.weekHigh52)}</div>
                                    </div>
                                  </div>
                                )}
                                {md.profile?.industry && (
                                  <div style={{ padding: "10px 12px", background: "var(--bg-elevated)" }}>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "3px" }}>Industry</div>
                                    <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--text-secondary)", lineHeight: 1.3 }}>{md.profile.industry}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Analyst consensus + price target */}
                        {(() => {
                          const md = marketData[holding.ticker];
                          if (!md.recommendation && !md.priceTarget) return null;
                          const rec = md.recommendation;
                          const total = rec ? rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell : 0;
                          const bullPct = total > 0 ? ((rec!.strongBuy + rec!.buy) / total) * 100 : 0;
                          const holdPct = total > 0 ? (rec!.hold / total) * 100 : 0;
                          const bearPct = total > 0 ? ((rec!.strongSell + rec!.sell) / total) * 100 : 0;
                          const upside = holding.current_price && md.priceTarget?.targetMean
                            ? ((md.priceTarget.targetMean - holding.current_price) / holding.current_price) * 100
                            : null;
                          return (
                            <div style={{ padding: "0 18px 14px", display: "grid", gridTemplateColumns: rec && md.priceTarget ? "1fr 1fr" : "1fr", gap: "16px" }}>
                              {rec && total > 0 && (
                                <div>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Analyst Ratings</div>
                                  <div style={{ display: "flex", gap: "3px", height: "4px", borderRadius: "2px", overflow: "hidden", marginBottom: "8px" }}>
                                    <div style={{ width: `${bullPct}%`, background: "var(--green)", flexShrink: 0 }} />
                                    <div style={{ width: `${holdPct}%`, background: "var(--amber)", flexShrink: 0 }} />
                                    <div style={{ width: `${bearPct}%`, background: "var(--red)", flexShrink: 0 }} />
                                  </div>
                                  <div style={{ display: "flex", gap: "12px", fontSize: "11px", fontFamily: "var(--font-mono)" }}>
                                    <span style={{ color: "var(--green)" }}>Buy {rec.strongBuy + rec.buy}</span>
                                    <span style={{ color: "var(--amber)" }}>Hold {rec.hold}</span>
                                    <span style={{ color: "var(--red)" }}>Sell {rec.strongSell + rec.sell}</span>
                                  </div>
                                </div>
                              )}
                              {md.priceTarget && (
                                <div>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Price Target</div>
                                  <div className="num" style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-primary)" }}>{formatPrice(md.priceTarget.targetMean)}</div>
                                  {upside !== null && (
                                    <div className="num" style={{ fontSize: "11px", color: upside >= 0 ? "var(--green)" : "var(--red)", marginTop: "2px" }}>
                                      {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% upside
                                    </div>
                                  )}
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px" }}>
                                    {formatPrice(md.priceTarget.targetLow)} — {formatPrice(md.priceTarget.targetHigh)}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Price chart */}
                        {holding.asset_type !== "cash" && (
                          <div style={{ padding: "0 18px 14px" }}>
                            <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Price Chart</div>
                            <StockChart key={holding.ticker} ticker={holding.ticker} height={160} defaultRange="1D" showRangeControls />
                          </div>
                        )}

                        {/* AI Digest */}
                        <div style={{ padding: "4px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>AI Digest</span>
                          <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
                        </div>
                        <div style={{ padding: "10px 18px 20px" }}>
                          {digestLoadingTicker === holding.ticker && !digestData[holding.ticker] && (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-muted)" }}>
                              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-blue)", opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
                              Generating digest for {holding.ticker}...
                            </div>
                          )}
                          {digestData[holding.ticker] && (() => {
                            const dig = digestData[holding.ticker];
                            return (
                              <div>
                                {dig.profile && (dig.profile.finnhubIndustry || dig.profile.country) && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginBottom: "10px" }}>
                                    {dig.profile.finnhubIndustry && (
                                      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "999px", background: "rgba(14,165,160,0.15)", color: "var(--brand-blue)", border: "1px solid rgba(14,165,160,0.25)" }}>
                                        {dig.profile.finnhubIndustry}
                                      </span>
                                    )}
                                    {dig.profile.country && (
                                      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "999px", background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                                        {dig.profile.country}
                                      </span>
                                    )}
                                    {dig.profile.ipo && (
                                      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: "999px", background: "var(--bg-surface)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                                        IPO {dig.profile.ipo.slice(0, 4)}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div style={{ marginBottom: "11px" }}>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Company</div>
                                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55 }}>{dig.company_overview}</div>
                                </div>
                                <div style={{ marginBottom: "11px" }}>
                                  <div style={{ fontSize: "10px", color: "var(--brand-blue)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Recent Activity</div>
                                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55 }}>{dig.news_digest}</div>
                                </div>
                                {dig.raw_earnings?.length > 0 && (
                                  <div style={{ marginBottom: "14px" }}>
                                    <div style={{ fontSize: "10px", color: "var(--green)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>EPS vs Estimates</div>
                                    <EarningsChart earnings={dig.raw_earnings} />
                                    {dig.earnings_snapshot && (
                                      <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "8px" }}>{dig.earnings_snapshot}</div>
                                    )}
                                  </div>
                                )}
                                {dig.raw_metrics && (
                                  <div style={{ marginBottom: "14px" }}>
                                    <div style={{ fontSize: "10px", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Financial Health</div>
                                    <FinancialMetricsGrid metrics={dig.raw_metrics} />
                                    {dig.financial_snapshot && (
                                      <div style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "8px" }}>{dig.financial_snapshot}</div>
                                    )}
                                  </div>
                                )}
                                {dig.raw_recommendation && (
                                  <div style={{ marginBottom: "14px" }}>
                                    <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>Analyst Consensus</div>
                                    <AnalystConsensusBar rec={dig.raw_recommendation} />
                                  </div>
                                )}
                                <div style={{ marginBottom: "8px" }}>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>Outlook</div>
                                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55 }}>{dig.market_outlook}</div>
                                </div>
                                <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>
                                  AI digest · {new Date(dig.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* News */}
                        {marketData[holding.ticker]?.news?.length > 0 && (
                          <>
                            <div style={{ padding: "4px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                News · {marketData[holding.ticker].news.length}
                              </span>
                              <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
                            </div>
                            {marketData[holding.ticker].news.slice(0, 6).map((item, i) => (
                              <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                                style={{ display: "block", padding: "12px 18px", borderBottom: i < Math.min(5, marketData[holding.ticker].news.length - 1) ? "1px solid var(--border-subtle)" : "none", textDecoration: "none", transition: "background 120ms ease" }}
                                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--card-hover)")}
                                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
                              >
                                <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "4px" }}>{item.headline}</div>
                                <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{item.source} · {timeAgo(item.datetime)}</div>
                              </a>
                            ))}
                          </>
                        )}

                        {/* Reddit Pulse */}
                        <div style={{ padding: "14px 18px 6px", display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Reddit Pulse</span>
                          <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
                        </div>
                        <div style={{ padding: "10px 18px 18px" }}>
                          {socialLoadingTicker === holding.ticker && !socialData[holding.ticker] && !socialErrors[holding.ticker] && (
                            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Fetching Reddit discussion for {holding.ticker}...</div>
                          )}
                          {socialErrors[holding.ticker] && (
                            <div style={{ padding: "10px 12px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", fontSize: "12px", color: "var(--text-muted)" }}>
                              {socialErrors[holding.ticker]}
                            </div>
                          )}
                          {socialData[holding.ticker] && (() => {
                            const sp = socialData[holding.ticker]!;

                            if (sp.source === "apewisdom") {
                              const changeColor = (sp.mention_change_pct ?? 0) >= 0 ? "var(--green)" : "var(--red)";
                              const trendLabel = (sp.mention_change_pct ?? 0) >= 10 ? "Trending Up" : (sp.mention_change_pct ?? 0) <= -10 ? "Trending Down" : "Stable";
                              const trendColor = (sp.mention_change_pct ?? 0) >= 10 ? "var(--green)" : (sp.mention_change_pct ?? 0) <= -10 ? "var(--red)" : "var(--text-secondary)";
                              return (
                                <div>
                                  {/* Sentiment badge — trend proxy since ApeWisdom has no post text */}
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

                            const scoreColor = sp.sentiment_score >= 15 ? "var(--green)" : sp.sentiment_score <= -15 ? "var(--red)" : "var(--text-secondary)";
                            const subColor = (s: string) => s === "bullish" ? "var(--green)" : s === "bearish" ? "var(--red)" : s === "mixed" ? "var(--amber)" : "var(--text-muted)";
                            const showSrc = socialShowSources[holding.ticker] ?? false;
                            const bullishCount = Math.round(sp.post_count * sp.bullish_pct / 100);
                            const bearishCount = Math.round(sp.post_count * sp.bearish_pct / 100);
                            const neutralCount = sp.post_count - bullishCount - bearishCount;
                            return (
                              <div>
                                {sp.stale && (
                                  <div style={{ padding: "5px 10px", background: "rgba(245,158,11,0.1)", border: "1px solid var(--amber-border)", borderRadius: "var(--radius-sm)", fontSize: "11px", color: "var(--amber)", marginBottom: "12px" }}>
                                    Showing cached data — Reddit unavailable
                                  </div>
                                )}
                                {/* Sentiment badge — the lead visual */}
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
                                    { label: "Conviction", value: sp.conviction_score, color: sp.conviction_score >= 60 ? "var(--green)" : sp.conviction_score >= 35 ? "var(--amber)" : "var(--text-secondary)" },
                                    { label: "Hype Risk", value: sp.hype_score, color: sp.hype_score >= 65 ? "var(--red)" : sp.hype_score >= 40 ? "var(--amber)" : "var(--text-secondary)" },
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
                                        <div style={{ fontSize: "10px", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "5px" }}>Risks</div>
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
                                      onClick={() => setSocialShowSources((prev) => ({ ...prev, [holding.ticker]: !showSrc }))}
                                      style={{ fontSize: "11px", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-body)", padding: 0, marginBottom: "6px" }}
                                    >
                                      {showSrc ? "Hide sources" : `Show top ${sp.source_post_links.length} source posts`}
                                    </button>
                                    {showSrc && sp.source_post_links.map((link, i) => (
                                      <a key={i} href={link.permalink} target="_blank" rel="noopener noreferrer"
                                        style={{ display: "block", padding: "7px 0", borderBottom: i < sp.source_post_links.length - 1 ? "1px solid var(--border-subtle)" : "none", textDecoration: "none" }}>
                                        <div style={{ fontSize: "12px", color: "var(--text-primary)", lineHeight: 1.4, marginBottom: "2px" }}>{link.title}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>r/{link.subreddit} · +{link.score} · {link.comment_count} comments</div>
                                      </a>
                                    ))}
                                  </div>
                                )}
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginTop: "6px" }}>
                                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                                    {sp.ai_powered ? "AI-analyzed" : "Keyword analysis"} · Updated {new Date(sp.fetched_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Insider Activity */}
                        {insiderData[holding.ticker] && (
                          <InsiderPanel ticker={holding.ticker} data={insiderData[holding.ticker]} />
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: "12px 18px", fontSize: "12px", color: "var(--text-muted)", background: "var(--bg-surface)" }}>
                        Could not load data for {holding.ticker}.
                      </div>
                    )}
                  </td>
                </tr>
              )}

              {/* Inline edit row */}
              {editingId === holding.id && (
                <tr key={`edit-${holding.id}`}>
                  <td colSpan={9} className="bg-blue-500/5 px-4 py-4">
                    <EditHoldingForm
                      holding={{
                        id: holding.id,
                        portfolio_id: portfolioId,
                        ticker: holding.ticker,
                        company_name: holding.company_name,
                        asset_type: holding.asset_type,
                        shares: holding.shares_number,
                        average_cost_basis: holding.average_cost_basis_number,
                        manual_price: holding.manual_price != null ? Number(holding.manual_price) : null,
                        notes: holding.notes ?? null,
                        opened_at: holding.opened_at ?? null,
                      }}
                      onClose={() => setEditingId(null)}
                    />
                    <HoldingLots
                      holdingId={holding.id}
                      portfolioId={portfolioId}
                      ticker={holding.ticker}
                      lots={lots.filter((l) => l.holding_id === holding.id)}
                    />
                  </td>
                </tr>
              )}

              {/* Lots-only row — opened via the Lots (N) quick button */}
              {lotsId === holding.id && editingId !== holding.id && (
                <tr key={`lots-${holding.id}`}>
                  <td colSpan={9} style={{ padding: "4px 16px 12px", background: "var(--bg-surface)", borderTop: "1px solid var(--border-subtle)" }}>
                    <HoldingLots
                      holdingId={holding.id}
                      portfolioId={portfolioId}
                      ticker={holding.ticker}
                      lots={lots.filter((l) => l.holding_id === holding.id)}
                    />
                  </td>
                </tr>
              )}

              {/* SEC EDGAR fundamentals row */}
              {fundamentalsId === holding.id && editingId !== holding.id && (
                <tr key={`fundamentals-${holding.id}`}>
                  <td colSpan={9} style={{ padding: 0 }}>
                    <FundamentalsPanel
                      ticker={holding.ticker}
                      currentPrice={holding.current_price ?? null}
                    />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
    </TickerLookupProvider>
  );
}
