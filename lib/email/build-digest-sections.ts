// Shared computation for the optional ("design your email") digest sections.
// Used by both the scheduled cron and the "Send test email" route so the
// preview always matches the real thing.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getFinnhubQuote, getFinnhubNews } from "@/lib/market-data/finnhub";
import { getBenchmarkComparison } from "@/lib/portfolio/benchmark";
import type { DigestTemplateData } from "@/lib/email/digest-template";

export type ExtraSectionPrefs = {
  include_top_movers?: boolean;
  include_benchmark?: boolean;
  include_ai_recs?: boolean;
  include_week_ahead?: boolean;
  include_news?: boolean;
  include_transactions?: boolean;
  include_cash?: boolean;
};

export type ExtraSections = Pick<
  DigestTemplateData,
  "topMovers" | "benchmark" | "aiRecs" | "weekAhead" | "news" | "transactions" | "cash"
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, any, any>;

export async function buildExtraDigestSections(
  db: DB,
  pref: ExtraSectionPrefs,
  portfolio: { id: string; cash_balance: number | string | null; benchmark_symbol?: string | null },
  now: Date,
): Promise<ExtraSections> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  let topMovers: ExtraSections["topMovers"] = null;
  let cash: ExtraSections["cash"] = null;
  let benchmark: ExtraSections["benchmark"] = null;
  let aiRecs: ExtraSections["aiRecs"] = null;
  let weekAhead: ExtraSections["weekAhead"] = null;
  let news: ExtraSections["news"] = null;
  let transactions: ExtraSections["transactions"] = null;

  // ── Top movers + cash (shared holdings + quote fetch with day change) ──
  if (pref.include_top_movers || pref.include_cash) {
    const { data: rawHoldings } = await db
      .from("holdings")
      .select("ticker, shares, average_cost_basis")
      .eq("portfolio_id", portfolio.id)
      .gt("shares", 0);
    const list = (rawHoldings ?? []) as { ticker: string; shares: number | string; average_cost_basis: number | string }[];
    const valued: { ticker: string; marketValue: number; dp: number | null }[] = [];
    const BATCH = 3;
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH);
      await Promise.all(batch.map(async (h) => {
        const q = await getFinnhubQuote(h.ticker);
        const price = q?.c ?? (Number(h.average_cost_basis) || 0);
        valued.push({ ticker: h.ticker, marketValue: Number(h.shares) * price, dp: q?.dp ?? null });
      }));
      if (i + BATCH < list.length) await new Promise((r) => setTimeout(r, 300));
    }
    const cashBalance = Number(portfolio.cash_balance ?? 0);
    const totalValue = valued.reduce((s, h) => s + h.marketValue, 0) + cashBalance;

    if (pref.include_top_movers) {
      const ranked = valued.filter((h) => h.dp != null).sort((a, b) => (b.dp ?? 0) - (a.dp ?? 0));
      const best = ranked[0] ? { ticker: ranked[0].ticker, change_pct: ranked[0].dp ?? 0 } : null;
      const worst = ranked.length > 1 ? { ticker: ranked[ranked.length - 1].ticker, change_pct: ranked[ranked.length - 1].dp ?? 0 } : null;
      if (best || worst) topMovers = { best, worst };
    }
    if (pref.include_cash && totalValue > 0) {
      cash = { cashPct: (cashBalance / totalValue) * 100, cashValue: cashBalance };
    }
  }

  // ── Transactions this week ──
  if (pref.include_transactions) {
    const { data: txns } = await db
      .from("portfolio_transactions")
      .select("transaction_type, ticker, quantity, price_per_share, traded_at")
      .eq("portfolio_id", portfolio.id)
      .gte("traded_at", `${sevenDaysAgo}T00:00:00`)
      .order("traded_at", { ascending: false })
      .limit(8);
    if (txns && txns.length > 0) {
      transactions = txns.map((t) => ({
        type: String(t.transaction_type ?? ""),
        ticker: String(t.ticker ?? ""),
        quantity: Number(t.quantity ?? 0),
        price: Number(t.price_per_share ?? 0),
      }));
    }
  }

  // ── Pending AI recommendations ──
  if (pref.include_ai_recs) {
    const { data: recs } = await db
      .from("recommendation_items")
      .select("action_type, ticker")
      .eq("portfolio_id", portfolio.id)
      .eq("recommendation_status", "proposed")
      .limit(10);
    if (recs && recs.length > 0) {
      aiRecs = {
        count: recs.length,
        items: recs.map((r) => ({ action: String(r.action_type ?? "review"), ticker: String(r.ticker ?? "") })),
      };
    }
  }

  // ── Top headlines (news for the largest holding) ──
  if (pref.include_news) {
    const { data: topHolding } = await db
      .from("holdings")
      .select("ticker")
      .eq("portfolio_id", portfolio.id)
      .gt("shares", 0)
      .order("total_value", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (topHolding?.ticker) {
      const items = await getFinnhubNews(topHolding.ticker, 7);
      const clean = items.filter((n) => n.headline && n.url).slice(0, 4);
      if (clean.length > 0) {
        news = clean.map((n) => ({ headline: n.headline, source: n.source, url: n.url }));
      }
    }
  }

  // ── Week Ahead (read from the shared market_week_ahead cache) ──
  if (pref.include_week_ahead) {
    const { data: wa } = await db
      .from("market_week_ahead")
      .select("lean, volatility, headline")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (wa?.headline) {
      weekAhead = { lean: wa.lean, volatility: wa.volatility, headline: wa.headline };
    }
  }

  // ── Benchmark vs index (this week) ──
  if (pref.include_benchmark) {
    const { data: weekSnaps } = await db
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value")
      .eq("portfolio_id", portfolio.id)
      .gte("snapshot_date", `${sevenDaysAgo}T00:00:00`)
      .order("snapshot_date", { ascending: true });
    if (weekSnaps && weekSnaps.length >= 2) {
      try {
        const cmp = await getBenchmarkComparison({
          snapshots: weekSnaps.map((s) => ({ snapshot_date: s.snapshot_date, total_value: Number(s.total_value) })),
          benchmarkSymbol: portfolio.benchmark_symbol || "SPY",
        });
        if (cmp.portfolioReturnPct != null && cmp.benchmarkReturnPct != null) {
          benchmark = {
            symbol: cmp.benchmarkSymbol,
            portfolioPct: cmp.portfolioReturnPct,
            benchmarkPct: cmp.benchmarkReturnPct,
          };
        }
      } catch {
        // non-fatal
      }
    }
  }

  return { topMovers, benchmark, aiRecs, weekAhead, news, transactions, cash };
}
