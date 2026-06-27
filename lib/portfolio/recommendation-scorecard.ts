import { createClient } from "@/lib/supabase/server";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";

// Shared scoring for executed AI recommendations. Used by both the compact "AI Scorecard"
// on the portfolio Overview and the full outcomes list on the analysis page, so the verdict
// rules live in one place.
//
// Verdict rules:
//   BUY/ADD: correct if current price >= cost basis (profitable vs what you paid).
//            "pending" if < 7 days old (too early to judge).
//   SELL/TRIM: correct if price is at/below the AI sell target.
//   HOLD/WATCH: pending (no clean pass/fail).

export type Verdict = "correct" | "incorrect" | "pending" | "no-data";

export type ScorecardRow = {
  id: string;
  ticker: string;
  company_name: string | null;
  action_type: string;
  conviction: string | null;
  target_price_1: number | null;
  thesis: string | null;
  created_at: string;
  currentPrice: number | null;
  costBasis: number | null;
  plPct: number | null;
  daysAgo: number;
  verdict: Verdict;
  vsTarget: number | null;
  tooEarly: boolean;
  sellPriceDrop: number | null;
};

export type Scorecard = {
  rows: ScorecardRow[];
  executedCount: number;
  scoredCount: number;      // rows with a correct/incorrect verdict
  correctCount: number;
  accuracyRate: number | null;
  avgPlPct: number | null;  // average P/L across scored BUYs that have a plPct
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

export async function computeRecommendationScorecard(portfolioId: string): Promise<Scorecard> {
  const supabase = await createClient();

  const { data: executedItems } = await supabase
    .from("recommendation_items")
    .select("id, ticker, company_name, action_type, conviction, target_price_1, thesis, created_at")
    .eq("portfolio_id", portfolioId)
    .eq("recommendation_status", "executed")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!executedItems?.length) {
    return { rows: [], executedCount: 0, scoredCount: 0, correctCount: 0, accuracyRate: null, avgPlPct: null };
  }

  const { data: holdings } = await supabase
    .from("holdings")
    .select("ticker, average_cost_basis, shares")
    .eq("portfolio_id", portfolioId);

  const holdingsMap = new Map((holdings ?? []).map((h) => [h.ticker.toUpperCase(), h]));

  const uniqueTickers = [...new Set(executedItems.map((i) => i.ticker?.toUpperCase()).filter(Boolean))] as string[];
  const quoteResults = await Promise.allSettled(
    uniqueTickers.map((t) => getFinnhubQuote(t).then((q) => ({ ticker: t, quote: q })))
  );
  const quoteMap = new Map<string, number>();
  for (const r of quoteResults) {
    if (r.status === "fulfilled" && r.value.quote) {
      const q = r.value.quote;
      // After-hours, current price (c) can be 0 — fall back to previous close (pc).
      const price = q.c > 0 ? q.c : (q.pc ?? 0) > 0 ? q.pc : null;
      if (price) quoteMap.set(r.value.ticker, price);
    }
  }

  const rows: ScorecardRow[] = executedItems.map((item) => {
    const ticker = (item.ticker ?? "").toUpperCase();
    const currentPrice = quoteMap.get(ticker) ?? null;
    const holding = holdingsMap.get(ticker) ?? null;
    const action = (item.action_type ?? "").toLowerCase();
    const isBuy = action === "buy" || action === "add";
    const isSell = action === "sell" || action === "trim";
    const isHold = action === "hold" || action === "watch";
    const daysAgo = daysSince(item.created_at);
    const costBasis = holding ? Number(holding.average_cost_basis) : null;
    const target = item.target_price_1 ? Number(item.target_price_1) : null;

    let plPct: number | null = null;
    if (isBuy && currentPrice !== null && costBasis !== null && costBasis > 0) {
      plPct = ((currentPrice - costBasis) / costBasis) * 100;
    }
    let vsTarget: number | null = null;
    if (isBuy && currentPrice !== null && target !== null && target > 0) {
      vsTarget = ((target - currentPrice) / currentPrice) * 100;
    }
    let sellPriceDrop: number | null = null;
    if (isSell && currentPrice !== null && target !== null && target > 0) {
      sellPriceDrop = ((target - currentPrice) / target) * 100;
    }

    const tooEarly = daysAgo < 7;
    let verdict: Verdict = "no-data";
    if (isBuy) {
      if (currentPrice === null || costBasis === null) verdict = "no-data";
      else if (tooEarly) verdict = "pending";
      else verdict = plPct !== null && plPct >= 0 ? "correct" : "incorrect";
    } else if (isSell) {
      if (target === null || currentPrice === null) verdict = "pending";
      else verdict = currentPrice <= target * 1.05 ? "correct" : "incorrect";
    } else if (isHold) {
      verdict = "pending";
    }

    return {
      id: item.id, ticker, company_name: item.company_name, action_type: action,
      conviction: item.conviction, target_price_1: target, thesis: item.thesis,
      created_at: item.created_at, currentPrice, costBasis, plPct, daysAgo, verdict,
      vsTarget, tooEarly, sellPriceDrop,
    };
  });

  const scored = rows.filter((r) => r.verdict === "correct" || r.verdict === "incorrect");
  const correctCount = rows.filter((r) => r.verdict === "correct").length;
  const accuracyRate = scored.length > 0 ? Math.round((correctCount / scored.length) * 100) : null;
  const buyPls = rows.filter((r) => r.plPct !== null).map((r) => r.plPct as number);
  const avgPlPct = buyPls.length > 0 ? buyPls.reduce((s, v) => s + v, 0) / buyPls.length : null;

  return {
    rows,
    executedCount: executedItems.length,
    scoredCount: scored.length,
    correctCount,
    accuracyRate,
    avgPlPct,
  };
}
