"use client";

import { useState, useTransition } from "react";
import { EditHoldingForm, DeleteHoldingButton } from "./add-holding-form";
import StockChart from "@/app/components/stock-chart";

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
  notes?: string | null;
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


type HoldingsTableProps = {
  portfolioId: string;
  holdings: ValuedHolding[];
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function timeAgo(unixTimestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - unixTimestamp;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function MarketDataPanel({ ticker, currentPrice, data }: {
  ticker: string;
  currentPrice: number | null;
  data: MarketData;
}) {
  const { news, recommendation, priceTarget } = data;
  const totalAnalysts = recommendation
    ? recommendation.strongBuy + recommendation.buy + recommendation.hold + recommendation.sell + recommendation.strongSell
    : 0;
  const bullish = recommendation ? recommendation.strongBuy + recommendation.buy : 0;
  const bearish = recommendation ? recommendation.sell + recommendation.strongSell : 0;
  const bullishPct = totalAnalysts > 0 ? Math.round((bullish / totalAnalysts) * 100) : null;
  const upside = currentPrice && priceTarget?.targetMean
    ? ((priceTarget.targetMean - currentPrice) / currentPrice) * 100
    : null;

  return (
    <div className="space-y-3 p-4 bg-blue-500/3 border-t border-white/5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">

        {/* Analyst consensus */}
        {recommendation && totalAnalysts > 0 && (
          <div className="rounded-xl border border-white/6 bg-white/3 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Analyst Consensus · {totalAnalysts} analysts
            </p>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/8 mb-2">
              <div className="h-full bg-emerald-500" style={{ width: `${((recommendation.strongBuy + recommendation.buy) / totalAnalysts) * 100}%` }} />
              <div className="h-full bg-slate-500" style={{ width: `${(recommendation.hold / totalAnalysts) * 100}%` }} />
              <div className="h-full bg-red-500" style={{ width: `${((recommendation.sell + recommendation.strongSell) / totalAnalysts) * 100}%` }} />
            </div>
            <div className="flex gap-3 text-xs">
              <span className="text-emerald-400">Buy {bullish}{bullishPct !== null && <span className="text-slate-600 ml-1">({bullishPct}%)</span>}</span>
              <span className="text-slate-500">Hold {recommendation.hold}</span>
              <span className="text-red-400">Sell {bearish}</span>
            </div>
          </div>
        )}

        {/* Price target */}
        {priceTarget && priceTarget.targetMean > 0 && (
          <div className="rounded-xl border border-white/6 bg-white/3 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Price Target</p>
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-white">{formatMoney(priceTarget.targetMean)}</p>
              {upside !== null && (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  upside > 0 ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/20 bg-red-500/10 text-red-400"
                }`}>
                  {upside > 0 ? "+" : ""}{upside.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              {formatMoney(priceTarget.targetLow)} – {formatMoney(priceTarget.targetHigh)} range
            </p>
          </div>
        )}

        {/* News */}
        {news.length > 0 && (
          <div className="rounded-xl border border-white/6 bg-white/3 p-3 sm:col-span-2 lg:col-span-1">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Recent News</p>
            <div className="space-y-2">
              {news.slice(0, 3).map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-1.5 rounded-lg p-1.5 transition hover:bg-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-4 text-slate-200 line-clamp-2">{item.headline}</p>
                    <p className="mt-0.5 text-[10px] text-slate-600">{item.source} · {timeAgo(item.datetime)}</p>
                  </div>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3 shrink-0 mt-0.5 text-slate-600">
                    <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z" clipRule="evenodd" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}

        {!recommendation && !priceTarget && news.length === 0 && (
          <p className="text-xs text-slate-600">No market data available for {ticker}.</p>
        )}
      </div>
    </div>
  );
}

function InsiderPanel({ ticker, data }: { ticker: string; data: InsiderData }) {
  const { transactions, netBuys, netSells, signal } = data;

  if (transactions.length === 0) {
    return (
      <div className="border-t border-white/5 bg-white/1 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">Insider Activity</p>
        <p className="text-xs text-slate-600">No open-market transactions in the last 90 days for {ticker}.</p>
      </div>
    );
  }

  const signalColor = signal === "buy" ? "text-emerald-400" : signal === "sell" ? "text-red-400" : "text-slate-400";
  const signalBg    = signal === "buy" ? "bg-emerald-500/10 border-emerald-500/20" : signal === "sell" ? "bg-red-500/10 border-red-500/20" : "bg-white/3 border-white/8";
  const signalLabel = signal === "buy" ? "Net Buying" : signal === "sell" ? "Net Selling" : "Mixed";

  return (
    <div className="border-t border-white/5 bg-white/1 px-4 py-3">
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Insider Activity · 90 days</p>
        <span className={`text-[10px] font-semibold rounded-full border px-2 py-0.5 ${signalBg} ${signalColor}`}>
          {signalLabel} · {netBuys}B / {netSells}S
        </span>
      </div>
      <div className="space-y-1.5">
        {transactions.slice(0, 6).map((tx, i) => {
          const isBuy = tx.transactionCode === "P";
          const value = tx.transactionPrice > 0 ? Math.abs(tx.change) * tx.transactionPrice : null;
          return (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isBuy ? "bg-emerald-500" : "bg-red-500"}`} />
              <span className={`font-semibold w-8 flex-shrink-0 ${isBuy ? "text-emerald-400" : "text-red-400"}`}>
                {isBuy ? "BUY" : "SELL"}
              </span>
              <span className="text-slate-300 flex-1 min-w-0 truncate">{tx.name}</span>
              <span className="text-slate-500 flex-shrink-0">
                {Math.abs(tx.change).toLocaleString()} shares
                {value != null && ` · $${(value / 1000).toFixed(0)}k`}
              </span>
              <span className="text-slate-600 flex-shrink-0 hidden sm:block">{tx.transactionDate}</span>
            </div>
          );
        })}
      </div>
      {transactions.length > 6 && (
        <p className="mt-2 text-[10px] text-slate-600">+{transactions.length - 6} more transactions · SEC Form 4</p>
      )}
    </div>
  );
}

export default function HoldingsTable({ portfolioId, holdings }: HoldingsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [insiderData, setInsiderData] = useState<Record<string, InsiderData>>({});
  const [loadingTicker, setLoadingTicker] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleExpand(holding: ValuedHolding) {
    if (expandedId === holding.id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(holding.id);

    const alreadyLoaded = marketData[holding.ticker];
    if (!alreadyLoaded) {
      setLoadingTicker(holding.ticker);
      try {
        const [mktRes, insRes] = await Promise.all([
          fetch(`/api/market-data/${holding.ticker}`),
          fetch(`/api/insider/${holding.ticker}`),
        ]);
        if (mktRes.ok) {
          const data = await mktRes.json();
          setMarketData((prev) => ({ ...prev, [holding.ticker]: data }));
        }
        if (insRes.ok) {
          const data = await insRes.json();
          setInsiderData((prev) => ({ ...prev, [holding.ticker]: data }));
        }
      } catch {
        // fail silently
      } finally {
        setLoadingTicker(null);
      }
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
                      <span title="Net insider buying (90d)" className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1 leading-4">
                        INS▲
                      </span>
                    )}
                    {insiderData[holding.ticker]?.signal === "sell" && (
                      <span title="Net insider selling (90d)" className="text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded px-1 leading-4">
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
                <td className="px-3 py-3 text-slate-300 hidden md:table-cell">{formatMoney(holding.current_price)}</td>
                <td className="px-3 py-3 font-medium text-white">{formatMoney(holding.market_value)}</td>
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
                    <DeleteHoldingButton holdingId={holding.id} portfolioId={portfolioId} ticker={holding.ticker} />
                  </div>
                </td>
              </tr>

              {/* Market data panel */}
              {expandedId === holding.id && (
                <tr key={`market-${holding.id}`}>
                  <td colSpan={9} className="p-0">
                    {loadingTicker === holding.ticker ? (
                      <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500 bg-white/2">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Loading market data for {holding.ticker}...
                      </div>
                    ) : marketData[holding.ticker] ? (
                      <MarketDataPanel
                        ticker={holding.ticker}
                        currentPrice={holding.current_price}
                        data={marketData[holding.ticker]}
                      />
                    ) : (
                      <div className="px-4 py-3 text-xs text-slate-600 bg-white/2">
                        Could not load market data for {holding.ticker}.
                      </div>
                    )}
                    {/* Chart — mounts only when expanded, lazy-loads its own data */}
                    {holding.asset_type !== "cash" && (
                      <div className="border-t border-white/5 bg-white/1 px-4 py-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                          Price Chart
                        </p>
                        <StockChart
                          key={holding.ticker}
                          ticker={holding.ticker}
                          height={140}
                          showRangeControls
                        />
                      </div>
                    )}
                    {/* Insider transactions */}
                    {insiderData[holding.ticker] && (
                      <InsiderPanel ticker={holding.ticker} data={insiderData[holding.ticker]} />
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
                        notes: holding.notes ?? null,
                      }}
                      onClose={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
