import { redirect } from "next/navigation";
import { findRecurringCharges, type CashFlowTransaction } from "@/lib/planning/transactions";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getUserXp } from "@/lib/gamification/xp";
import WrappedClient, { type WrappedStats, type MoneyYear } from "./wrapped-client";

export const metadata = { title: "Your Year in Review — BuyTune" };
export const dynamic = "force-dynamic";

async function count(qb: PromiseLike<{ count: number | null }>): Promise<number> {
  try { const { count } = await qb; return count ?? 0; } catch { return 0; }
}


// The money side of the year, from Cash Flow + net worth history: what came in, what went
// out, savings rate, the biggest spending month and category, subscriptions per year, and
// net worth growth. Null when there's no Cash Flow data for the year.
async function loadMoneyYear(
  supabase: Awaited<ReturnType<typeof createClient>>, userId: string, year: number, yearStart: string, yearEnd: string,
): Promise<MoneyYear | null> {
  try {
    const [{ data: rows }, { data: items }, { data: nw }] = await Promise.all([
      supabase.from("cash_flow_transactions")
        .select("id, txn_date, period_year, period_month, description, merchant, amount, direction, cash_flow_item_id, source, import_batch_id, note")
        .eq("user_id", userId).gte("txn_date", `${year - 1}-07-01`).lte("txn_date", yearEnd.slice(0, 10)).limit(10000),
      supabase.from("cash_flow_items").select("id, label").eq("user_id", userId),
      supabase.from("net_worth_history").select("snapshot_date, net_worth").eq("user_id", userId)
        .gte("snapshot_date", yearStart.slice(0, 10)).order("snapshot_date", { ascending: true }),
    ]);
    const all = ((rows ?? []) as unknown as CashFlowTransaction[]).map((t) => ({ ...t, amount: Number(t.amount) }));
    const txns = all.filter((t) => t.period_year === year);
    if (txns.length === 0) return null;

    const earned = txns.filter((t) => t.direction === "in").reduce((s, t) => s + t.amount, 0);
    const spent = txns.filter((t) => t.direction === "out").reduce((s, t) => s + t.amount, 0);
    const saved = txns.filter((t) => t.direction === "save").reduce((s, t) => s + t.amount, 0);

    const byMonth = new Map<number, number>();
    for (const t of txns) if (t.direction === "out") byMonth.set(t.period_month, (byMonth.get(t.period_month) ?? 0) + t.amount);
    const topMonth = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    const label = new Map((items ?? []).map((i) => [i.id as string, i.label as string]));
    const byBucket = new Map<string, number>();
    for (const t of txns) {
      if (t.direction !== "out" || !t.cash_flow_item_id) continue;
      const name = label.get(t.cash_flow_item_id);
      if (name) byBucket.set(name, (byBucket.get(name) ?? 0) + t.amount);
    }
    const topCategory = [...byBucket.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    const subs = findRecurringCharges(all, new Date(Math.min(Date.now(), Date.parse(yearEnd)))).filter((c) => !c.stale);
    const firstMonth = Math.min(...txns.map((t) => t.period_month));
    const nwRows = nw ?? [];
    const nwGrowth = nwRows.length >= 2 ? Number(nwRows[nwRows.length - 1].net_worth) - Number(nwRows[0].net_worth) : null;

    return {
      earned: Math.round(earned), spent: Math.round(spent), saved: Math.round(saved),
      savingsRate: earned > 0 ? Math.round(((earned - spent) / earned) * 100) : null,
      topMonth: topMonth ? { month: topMonth[0], amount: Math.round(topMonth[1]) } : null,
      topCategory: topCategory ? { label: topCategory[0], amount: Math.round(topCategory[1]) } : null,
      subscriptionsYearly: Math.round(subs.reduce((s, c) => s + c.yearly, 0)),
      subscriptionCount: subs.length,
      netWorthGrowth: nwGrowth !== null ? Math.round(nwGrowth) : null,
      partialFromMonth: firstMonth > 2 ? firstMonth : null,
    };
  } catch {
    return null;
  }
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

  type Winner = { ticker: string; gainPct: number; gain: number };
  const perPortfolio = await Promise.all(active.map(async (p): Promise<{ value: number; best: Winner | null }> => {
    const hs = byPortfolio.get(p.id) ?? [];
    const cash = Number(p.cash_balance ?? 0);
    try {
      const val = await getPortfolioValuation({
        holdings: hs.map((h) => ({ id: h.id, ticker: h.ticker, company_name: h.company_name, asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis, manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at })),
        cashBalance: cash,
      });
      let best: Winner | null = null;
      for (const vh of val.valued_holdings) {
        const cost = Number(vh.average_cost_basis ?? 0) * vh.shares_number;
        const mv = vh.market_value ?? 0;
        if (cost > 0 && mv > 0) {
          const gain = mv - cost, gainPct = (gain / cost) * 100;
          if (gain > 0 && (best === null || gain > best.gain)) best = { ticker: vh.ticker, gainPct, gain };
        }
      }
      return { value: val.total_portfolio_value, best };
    } catch {
      return { value: cash, best: null };
    }
  }));
  const totalValue = perPortfolio.reduce((s, r) => s + r.value, 0);
  const winner = perPortfolio.reduce<Winner | null>((w, r) => (r.best && (!w || r.best.gain > w.gain) ? r.best : w), null);

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

  const [xp, money] = await Promise.all([getUserXp(user.id), loadMoneyYear(supabase, user.id, year, yearStart, yearEnd)]);

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
    money,
  };

  return <WrappedClient stats={stats} />;
}
