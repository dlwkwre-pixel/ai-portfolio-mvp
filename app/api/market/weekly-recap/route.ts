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

  // Only serve cache if it has the new rich payload. Rows without it were generated
  // by the old (buggy) code path and must be regenerated.
  if (cached?.narrative && cached.payload) {
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
  const [{ data: weekSnapshots }, { data: thisWeekTxns }, ...valuations] = await Promise.all([
    supabase
      .from("portfolio_snapshots")
      .select("portfolio_id, snapshot_date, total_value")
      .in("portfolio_id", portfolioIds)
      .gte("snapshot_date", monday.toISOString())
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("portfolio_transactions")
      .select("ticker, transaction_type, quantity, price_per_share, traded_at")
      .in("portfolio_id", portfolioIds)
      .gte("traded_at", monday.toISOString())
      .order("traded_at", { ascending: false })
      .limit(20),
    ...portfolios.map(async (p) => {
      const { data: holdings } = await supabase
        .from("holdings")
        .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
        .eq("portfolio_id", p.id);
      try {
        return await getPortfolioValuation({
          holdings: (holdings ?? []).map((h) => ({
            id: h.id, ticker: h.ticker, company_name: h.company_name,
            asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
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

  // Week baseline: aggregate snapshots by date, use earliest valid (>0) day that
  // isn't today. Prevents the cross-portfolio / corrupt-zero comparison bug.
  const byDate = new Map<string, number>();
  for (const s of weekSnapshots ?? []) {
    const d = (s.snapshot_date as string).split("T")[0];
    byDate.set(d, (byDate.get(d) ?? 0) + Number(s.total_value ?? 0));
  }
  const todayStr = now.toISOString().split("T")[0];
  const baselineDate = [...byDate.keys()].sort().find((d) => d < todayStr && (byDate.get(d) ?? 0) > 0);
  const baselineValue = baselineDate ? byDate.get(baselineDate)! : null;

  let weekReturnPct: number | null = null;
  if (baselineValue && baselineValue > 0 && currentValue > 0) {
    weekReturnPct = ((currentValue - baselineValue) / baselineValue) * 100;
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
