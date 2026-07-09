import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getFinnhubEarningsCalendar } from "@/lib/market-data/finnhub";

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Pulse — the "since your last visit" digest for a single portfolio.
// Everything here is computed from data we already have (no bank API): today's
// movers among the user's holdings, earnings landing this week, AI recs awaiting
// a decision, journal entries due for a 30-day reflection, dividends recently
// paid, and a single concentration flag. It also returns current prices so the
// client can diff them against a localStorage snapshot for a true "since you were
// last here" delta. `oneThing` is the one prioritized action for this visit.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const THIRTY_DAYS = 30 * DAY;

type OneThing = {
  kind: string;
  label: string;
  detail: string;
  href: string;
  tone: "action" | "warn" | "info";
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: portfolio } = await supabase
    .from("portfolios").select("id, cash_balance").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [
    { data: holdings },
    { data: pendingRecs },
    { data: journalRows },
    { data: dividendRows },
    { data: latestRun },
  ] = await Promise.all([
    supabase.from("holdings")
      .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
      .eq("portfolio_id", id),
    supabase.from("recommendation_items")
      .select("id, ticker, action_type").eq("portfolio_id", id).eq("recommendation_status", "proposed"),
    supabase.from("decision_journal")
      .select("id, created_at, reviewed_at").eq("user_id", user.id).eq("portfolio_id", id).is("reviewed_at", null)
      .then((r) => r, () => ({ data: null })),
    supabase.from("cash_ledger")
      .select("amount, reason, effective_at").eq("portfolio_id", id).ilike("reason", "%dividend%")
      .order("effective_at", { ascending: false }).limit(12)
      .then((r) => r, () => ({ data: null })),
    supabase.from("recommendation_runs")
      .select("id, created_at").eq("portfolio_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then((r) => r, () => ({ data: null })),
  ]);

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((h) => ({
      id: h.id, ticker: h.ticker, company_name: h.company_name,
      asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
      manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
    })),
    cashBalance: Number(portfolio.cash_balance ?? 0),
  });
  const valued = valuation.valued_holdings;

  // Today's movers (used as a fallback when the client has no prior snapshot).
  const movers = valued
    .filter((h) => h.day_change_pct != null && h.has_live_price)
    .sort((a, b) => Math.abs(b.day_change_pct!) - Math.abs(a.day_change_pct!))
    .slice(0, 3)
    .map((h) => ({ ticker: h.ticker, company: h.company_name, pct: Math.round(h.day_change_pct! * 10) / 10 }));

  // Current prices, keyed by ticker, for the client-side since-last-visit diff.
  const prices: Record<string, number> = {};
  for (const h of valued) if (h.current_price && h.current_price > 0) prices[h.ticker] = h.current_price;

  // Single largest position, flagged only when it dominates the book.
  const top = valued.filter((h) => h.weight_pct != null).sort((a, b) => b.weight_pct! - a.weight_pct!)[0];
  const concentration = top && top.weight_pct! >= 35
    ? { ticker: top.ticker, pct: Math.round(top.weight_pct!) } : null;

  const now = Date.now();
  const journalDue = (journalRows ?? []).filter(
    (r) => now - new Date(r.created_at).getTime() >= THIRTY_DAYS,
  ).length;

  const divRecent = (dividendRows ?? []).filter(
    (d) => now - new Date(d.effective_at).getTime() <= THIRTY_DAYS,
  );
  const dividendTotal = Math.round(divRecent.reduce((s, d) => s + Number(d.amount || 0), 0) * 100) / 100;

  // Earnings landing in the next 7 days among held tickers (non-fatal).
  const tickers = valued.map((h) => h.ticker).filter(Boolean) as string[];
  let earnings: { ticker: string; date: string }[] = [];
  if (tickers.length > 0) {
    try {
      const cal = await getFinnhubEarningsCalendar(tickers, 7);
      const seen = new Set<string>();
      earnings = cal
        .filter((e) => e.symbol && !seen.has(e.symbol) && seen.add(e.symbol))
        .map((e) => ({ ticker: e.symbol, date: e.date }))
        .slice(0, 5);
    } catch { /* earnings are optional */ }
  }

  const pendingCount = pendingRecs?.length ?? 0;
  const base = `/portfolios/${id}`;

  // The one prioritized action for this visit, most decision-worthy first.
  let oneThing: OneThing | null = null;
  if (pendingCount > 0) {
    oneThing = {
      kind: "recs",
      label: `${pendingCount} AI ${pendingCount === 1 ? "recommendation" : "recommendations"} awaiting your call`,
      detail: "Act on them or dismiss so your book reflects your decisions.",
      href: `${base}?tab=ai`, tone: "action",
    };
  } else if (journalDue > 0) {
    oneThing = {
      kind: "journal",
      label: `${journalDue} journal ${journalDue === 1 ? "entry is" : "entries are"} ready to reflect on`,
      detail: "Score your reasoning against how the trade actually played out.",
      href: `${base}?tab=journal`, tone: "action",
    };
  } else if (concentration) {
    oneThing = {
      kind: "concentration",
      label: `${concentration.ticker} is ${concentration.pct}% of this portfolio`,
      detail: "One position this large drives most of your risk. Worth a look.",
      href: `${base}?tab=analytics`, tone: "warn",
    };
  } else if (earnings.length > 0) {
    oneThing = {
      kind: "earnings",
      label: `${earnings[0].ticker} reports earnings this week`,
      detail: earnings.length > 1 ? `${earnings.length} of your holdings report in the next 7 days.` : "Earnings can move the position sharply.",
      href: `${base}?tab=ai`, tone: "info",
    };
  } else if (dividendTotal > 0) {
    oneThing = {
      kind: "dividend",
      label: `You collected $${dividendTotal.toLocaleString()} in recent dividends`,
      detail: "Reinvest it or let it build your cash cushion.",
      href: `${base}?tab=income`, tone: "info",
    };
  } else if (valued.length > 0) {
    oneThing = {
      kind: "analysis",
      label: "Your plan looks steady. Pull a fresh AI read?",
      detail: "A new analysis catches anything that shifted since last time.",
      href: `${base}?tab=ai`, tone: "info",
    };
  }

  return NextResponse.json({
    holdingsCount: valued.length,
    movers,
    prices,
    earnings,
    dividends: { total: dividendTotal, count: divRecent.length },
    pendingRecs: pendingCount,
    latestRunId: latestRun?.id ?? null,
    journalDue,
    concentration,
    oneThing,
    asOf: new Date().toISOString(),
  });
}
