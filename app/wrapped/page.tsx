import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getUserXp } from "@/lib/gamification/xp";
import WrappedClient, { type WrappedStats } from "./wrapped-client";

export const metadata = { title: "Your Year in Review — BuyTune" };
export const dynamic = "force-dynamic";

async function count(qb: PromiseLike<{ count: number | null }>): Promise<number> {
  try { const { count } = await qb; return count ?? 0; } catch { return 0; }
}

export default async function WrappedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/wrapped");

  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd = `${year}-12-31T23:59:59.999Z`;

  const { data: portfolios } = await supabase
    .from("portfolios").select("id, name, cash_balance")
    .eq("user_id", user.id).eq("is_active", true);
  const active = portfolios ?? [];
  const ids = active.map((p) => p.id);

  // Holdings (one query) → value each portfolio in parallel for total value + biggest winner.
  const { data: allHoldings } = await supabase.from("holdings")
    .select("id, portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .in("portfolio_id", ids);
  type HRow = NonNullable<typeof allHoldings>[number];
  const byPortfolio = new Map<string, HRow[]>();
  for (const h of allHoldings ?? []) {
    const arr = byPortfolio.get(h.portfolio_id) ?? [];
    arr.push(h);
    byPortfolio.set(h.portfolio_id, arr);
  }

  let totalValue = 0;
  let winner: { ticker: string; gainPct: number; gain: number } | null = null;
  await Promise.all(active.map(async (p) => {
    const hs = byPortfolio.get(p.id) ?? [];
    const cash = Number(p.cash_balance ?? 0);
    try {
      const val = await getPortfolioValuation({
        holdings: hs.map((h) => ({ id: h.id, ticker: h.ticker, company_name: h.company_name, asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis, manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at })),
        cashBalance: cash,
      });
      totalValue += val.total_portfolio_value;
      for (const vh of val.valued_holdings) {
        const cost = Number(vh.average_cost_basis ?? 0) * vh.shares_number;
        const mv = vh.market_value ?? 0;
        if (cost > 0 && mv > 0) {
          const gain = mv - cost, gainPct = (gain / cost) * 100;
          if (gain > 0 && (winner == null || gain > winner.gain)) winner = { ticker: vh.ticker, gainPct, gain };
        }
      }
    } catch { totalValue += cash; }
  }));

  const idsOrNone = ids.length ? ids : ["__none__"];
  const [
    { data: deposits },
    { data: divs },
    trades,
    aiRuns,
    decisions,
    { data: xpEvents },
    badgesThisYear,
    { data: profile },
  ] = await Promise.all([
    supabase.from("cash_ledger").select("amount").in("portfolio_id", idsOrNone).eq("direction", "IN").eq("reason", "deposit").gte("effective_at", yearStart).lte("effective_at", yearEnd),
    supabase.from("portfolio_transactions").select("net_cash_impact").in("portfolio_id", idsOrNone).eq("transaction_type", "dividend").gte("traded_at", yearStart).lte("traded_at", yearEnd),
    count(supabase.from("portfolio_transactions").select("id", { count: "exact", head: true }).in("portfolio_id", idsOrNone).in("transaction_type", ["buy", "sell"]).gte("traded_at", yearStart).lte("traded_at", yearEnd)),
    count(supabase.from("recommendation_runs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "completed").gte("created_at", yearStart)),
    count(supabase.from("decision_journal").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", yearStart)),
    supabase.from("xp_events").select("xp").eq("user_id", user.id).gte("created_at", yearStart),
    count(supabase.from("user_badges").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("earned_at", yearStart)),
    supabase.from("user_profiles").select("longest_streak").eq("id", user.id).maybeSingle(),
  ]);

  const xp = await getUserXp(user.id);

  const stats: WrappedStats = {
    year,
    totalValue: Math.round(totalValue),
    contributions: Math.round((deposits ?? []).reduce((s, d) => s + Number(d.amount ?? 0), 0)),
    dividends: Math.round((divs ?? []).reduce((s, d) => s + Number(d.net_cash_impact ?? 0), 0)),
    trades,
    aiRuns,
    decisions,
    xpThisYear: (xpEvents ?? []).reduce((s, e) => s + Number(e.xp ?? 0), 0),
    level: xp.level,
    badges: badgesThisYear,
    longestStreak: Number((profile as { longest_streak?: number | null } | null)?.longest_streak ?? 0),
    holdings: (allHoldings ?? []).length,
    portfolios: active.length,
    topGainer: winner ? { ticker: (winner as { ticker: string }).ticker, gainPct: Math.round((winner as { gainPct: number }).gainPct) } : null,
    name: user.email?.split("@")[0] ?? "investor",
  };

  return <WrappedClient stats={stats} />;
}
