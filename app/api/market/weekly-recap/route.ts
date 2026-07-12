import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGemini } from "@/lib/ai/gemini";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

export type RecapMover = {
  ticker: string;
  market_value: number;
  day_change_pct: number | null;
};

export type RecapPayload = {
  calc_version?: number;
  current_value: number;
  week_return_pct: number | null;
  baseline_value: number | null;
  best: { ticker: string; change_pct: number } | null;
  worst: { ticker: string; change_pct: number } | null;
  top_movers: RecapMover[];
  txn_count: number;
  holdings_count: number;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Week bounds: Monday through Sunday
  const now = new Date();
  const day = now.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);

  const weekStart = monday.toISOString().split("T")[0];

  // Check cache — return rich payload if present
  const { data: cached } = await supabase
    .from("portfolio_weekly_recaps")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  // Only serve cache if it has the new rich payload AND the current calc version.
  // Rows from older (buggy) code paths are regenerated so the fix takes effect.
  if (cached?.narrative && cached.payload && (cached.payload as { calc_version?: number }).calc_version === 2) {
    return NextResponse.json({
      narrative: cached.narrative,
      week_start: weekStart,
      ...(cached.payload as RecapPayload),
    });
  }

  // Fetch user portfolios
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(5);

  if (!portfolios?.length) {
    return NextResponse.json({ error: "No portfolios" }, { status: 404 });
  }

  const portfolioIds = portfolios.map((p) => p.id);

  // Live valuation across all portfolios (same source the dashboard uses) +
  // this week's snapshots (for a baseline) + this week's transactions.
  const [{ data: weekSnapshots }, { data: thisWeekTxns }, { data: weekCashflows }, ...valuations] = await Promise.all([
    supabase
      .from("portfolio_snapshots")
      .select("portfolio_id, snapshot_date, total_value")
      .in("portfolio_id", portfolioIds)
      .gte("snapshot_date", monday.toISOString())
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("portfolio_transactions")
      .select("portfolio_id, ticker, transaction_type, quantity, price_per_share, gross_amount, traded_at")
      .in("portfolio_id", portfolioIds)
      .gte("traded_at", monday.toISOString())
      .order("traded_at", { ascending: false })
      .limit(50),
    // Deposits / withdrawals this week — needed to exclude cash flows from the return.
    // Source of truth is cash_ledger (deposit/withdraw/dividend writes go here).
    supabase
      .from("cash_ledger")
      .select("direction, amount, effective_at")
      .in("portfolio_id", portfolioIds)
      .gte("effective_at", monday.toISOString()),
    ...portfolios.map(async (p) => {
      const { data: holdings } = await supabase
        .from("holdings")
        .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
        .eq("portfolio_id", p.id);
      try {
        return await getPortfolioValuation({
          holdings: (holdings ?? []).map((h) => ({
            id: h.id, ticker: h.ticker, company_name: h.company_name,
            asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
            manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
          })),
          cashBalance: Number(p.cash_balance ?? 0),
        });
      } catch {
        return null;
      }
    }),
  ]);

  // Aggregate live valuation
  let currentValue = 0;
  const allHoldings: { ticker: string; market_value: number; day_change_pct: number | null }[] = [];
  for (const val of valuations) {
    if (!val) continue;
    currentValue += val.total_portfolio_value;
    for (const h of val.valued_holdings) {
      if ((h.shares_number ?? 0) <= 0) continue;
      allHoldings.push({
        ticker: h.ticker,
        market_value: h.market_value ?? 0,
        day_change_pct: h.day_change_pct,
      });
    }
  }

  const holdingsCount = allHoldings.length;

  // Week baseline: take ONE value per portfolio per day (the latest snapshot of that
  // day — rows are ordered ascending, so the last write wins), THEN sum across
  // portfolios. Multiple writers (daily cron, dashboard chart, 4-hour intraday) can each
  // insert a row for the same portfolio on the same day; summing all of them would
  // double/triple-count the baseline and fabricate a large fake loss.
  const perDatePortfolio = new Map<string, Map<string, number>>(); // date -> (portfolioId -> value)
  for (const s of weekSnapshots ?? []) {
    const d = (s.snapshot_date as string).split("T")[0];
    if (!perDatePortfolio.has(d)) perDatePortfolio.set(d, new Map());
    perDatePortfolio.get(d)!.set(s.portfolio_id, Number(s.total_value ?? 0));
  }
  const byDate = new Map<string, number>();
  for (const [d, m] of perDatePortfolio) {
    byDate.set(d, [...m.values()].reduce((a, b) => a + b, 0));
  }
  const todayStr = now.toISOString().split("T")[0];
  const baselineDate = [...byDate.keys()].sort().find((d) => d < todayStr && (byDate.get(d) ?? 0) > 0);
  const baselineValue = baselineDate ? byDate.get(baselineDate)! : null;

  // Cash-flow-adjusted (Modified Dietz) return — excludes deposits/withdrawals so a
  // money movement isn't mistaken for a gain/loss. Flows are weighted by the share of
  // the period remaining after they occurred. This is the same principle the benchmark
  // TWR uses; without it, a single withdrawal can read as a double-digit "loss" even
  // when every holding is up.
  let weekReturnPct: number | null = null;
  if (baselineValue && baselineValue > 0 && currentValue > 0 && baselineDate) {
    const startMs = new Date(`${baselineDate}T00:00:00`).getTime();
    const endMs = now.getTime();
    const span = Math.max(1, endMs - startMs);
    let netFlows = 0;       // signed: deposits (+) minus withdrawals (−)
    let weightedFlows = 0;  // Modified Dietz time-weighting
    for (const cf of weekCashflows ?? []) {
      const t = new Date(cf.effective_at as string).getTime();
      if (!Number.isFinite(t) || t <= startMs || t > endMs) continue;
      const amt = Number(cf.amount ?? 0);
      const signed = (String(cf.direction ?? "").toUpperCase() === "OUT") ? -amt : amt;
      netFlows += signed;
      weightedFlows += signed * ((endMs - t) / span); // fraction of period the flow was invested
    }
    // Linked (brokerage-synced) portfolios keep no deposit rows in cash_ledger (the
    // broker sync owns their history), so their deposits would read as gains here. Their
    // net BUY minus SELL cash this week is the closest proxy for external money in/out —
    // on a swept brokerage account, purchases are funded by deposits.
    try {
      const { getLinkedPortfolioIds } = await import("@/lib/connections/snaptrade");
      const linkedIds = await getLinkedPortfolioIds(user.id);
      if (linkedIds.size > 0) {
        for (const tx of thisWeekTxns ?? []) {
          const pid = (tx as { portfolio_id?: string }).portfolio_id;
          if (!pid || !linkedIds.has(pid)) continue;
          const t = new Date(tx.traded_at as string).getTime();
          if (!Number.isFinite(t) || t <= startMs || t > endMs) continue;
          const gross = Math.abs(Number((tx as { gross_amount?: number | null }).gross_amount ?? 0))
            || Math.abs(Number(tx.quantity ?? 0) * Number(tx.price_per_share ?? 0));
          if (!(gross > 0)) continue;
          const signed = String(tx.transaction_type).toLowerCase() === "sell" ? -gross : gross;
          netFlows += signed;
          weightedFlows += signed * ((endMs - t) / span);
        }
      }
    } catch { /* linked helpers unavailable → keep ledger-only flows */ }
    const denom = baselineValue + weightedFlows;
    if (denom > 0) {
      weekReturnPct = ((currentValue - baselineValue - netFlows) / denom) * 100;
    }
  }

  // Best / worst movers from live day-change
  const ranked = allHoldings
    .filter((h) => h.day_change_pct != null)
    .sort((a, b) => (b.day_change_pct ?? 0) - (a.day_change_pct ?? 0));
  const best = ranked.length > 0 ? { ticker: ranked[0].ticker, change_pct: ranked[0].day_change_pct ?? 0 } : null;
  const worst = ranked.length > 1 ? { ticker: ranked[ranked.length - 1].ticker, change_pct: ranked[ranked.length - 1].day_change_pct ?? 0 } : null;

  const topMovers: RecapMover[] = [...allHoldings]
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 6);

  const txnCount = (thisWeekTxns ?? []).length;
  const txnSummary = (thisWeekTxns ?? [])
    .slice(0, 5)
    .map((t) => `${t.transaction_type} ${t.quantity} ${t.ticker} @ $${t.price_per_share}`)
    .join("; ");

  const holdingsSummary = topMovers
    .slice(0, 5)
    .map((h) => `${h.ticker} (${(h.day_change_pct ?? 0) >= 0 ? "+" : ""}${(h.day_change_pct ?? 0).toFixed(1)}%)`)
    .join(", ");

  // Empty-state guard — don't generate a misleading recap for an empty book
  if (currentValue <= 0 || holdingsCount === 0) {
    return NextResponse.json({ error: "No holdings to recap" }, { status: 404 });
  }

  const prompt = `You are a sharp, encouraging portfolio coach. Write a 2-3 sentence week-in-review for this investor. Be specific and reference the actual numbers. Avoid generic filler.

Portfolio data for week of ${weekStart}:
- Current total value: $${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
- Week return vs Monday: ${weekReturnPct != null ? `${weekReturnPct >= 0 ? "+" : ""}${weekReturnPct.toFixed(2)}%` : "not enough snapshot history yet"}
- Holdings: ${holdingsSummary || "none"}
- Best performer today: ${best ? `${best.ticker} (${best.change_pct >= 0 ? "+" : ""}${best.change_pct.toFixed(1)}%)` : "N/A"}
- Weakest today: ${worst ? `${worst.ticker} (${worst.change_pct >= 0 ? "+" : ""}${worst.change_pct.toFixed(1)}%)` : "N/A"}
- Trades this week: ${txnSummary || "none"}

Acknowledge a specific win or concern. End with one concrete, practical thought for next week. No em dashes. Plain text only, no JSON or markdown.`;

  const narrative = await callGemini(prompt, { temperature: 0.5, maxOutputTokens: 400 });
  if (!narrative) {
    return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
  }

  const payload: RecapPayload = {
    calc_version: 2,
    current_value: currentValue,
    week_return_pct: weekReturnPct,
    baseline_value: baselineValue,
    best,
    worst,
    top_movers: topMovers,
    txn_count: txnCount,
    holdings_count: holdingsCount,
  };

  // Cache it
  void supabase.from("portfolio_weekly_recaps").upsert(
    {
      user_id: user.id,
      week_start: weekStart,
      narrative: narrative.trim(),
      week_return_pct: weekReturnPct,
      best_ticker: best?.ticker ?? null,
      worst_ticker: worst?.ticker ?? null,
      payload,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" }
  );

  return NextResponse.json({
    narrative: narrative.trim(),
    week_start: weekStart,
    ...payload,
  });
}
