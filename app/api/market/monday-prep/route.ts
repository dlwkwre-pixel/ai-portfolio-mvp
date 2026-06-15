import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubEarningsWeek } from "@/lib/market-data/finnhub";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";

export type PrepHolding = {
  ticker: string;
  company_name: string | null;
  total_value: number;
  weight_pct: number;
  portfolio_id: string;
};

export type PrepItem = {
  id: string;
  label: string;
  detail: string;
  type: "earnings" | "risk" | "action" | "info";
  href: string | null;
  cta: string | null;
  ticker: string | null; // when set, opening this item shows the quick-look modal
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 6 ? 2 : 8 - day;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  const nextFriday = new Date(nextMonday);
  nextFriday.setDate(nextMonday.getDate() + 4);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const from = fmt(nextMonday);
  const to = fmt(nextFriday);

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(5);

  const portfolioList = portfolios ?? [];
  const portfolioIds = portfolioList.map((p) => p.id);
  const firstPortfolioId = portfolioIds[0] ?? null;

  // Live valuation for accurate weights + day moves, plus earnings and open recs.
  const [earningsAll, { data: openRecs }, ...valuations] = await Promise.all([
    getFinnhubEarningsWeek(from, to),
    portfolioIds.length
      ? supabase
          .from("recommendation_items")
          .select("id, portfolio_id, action_type, ticker")
          .in("portfolio_id", portfolioIds)
          .eq("recommendation_status", "proposed")
          .limit(20)
      : Promise.resolve({ data: [] }),
    ...portfolioList.map(async (p) => {
      const { data: holdings } = await supabase
        .from("holdings")
        .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
        .eq("portfolio_id", p.id);
      try {
        const val = await getPortfolioValuation({
          holdings: (holdings ?? []).map((h) => ({
            id: h.id, ticker: h.ticker, company_name: h.company_name,
            asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
          })),
          cashBalance: Number(p.cash_balance ?? 0),
        });
        return { portfolioId: p.id, cash: Number(p.cash_balance ?? 0), val };
      } catch {
        return { portfolioId: p.id, cash: Number(p.cash_balance ?? 0), val: null };
      }
    }),
  ]);

  type Agg = { ticker: string; company_name: string | null; market_value: number; day_change_pct: number | null; portfolio_id: string };
  const agg: Agg[] = [];
  let totalCash = 0;
  let totalValue = 0;

  for (const v of valuations) {
    totalCash += v.cash;
    if (!v.val) continue;
    totalValue += v.val.total_portfolio_value;
    for (const h of v.val.valued_holdings) {
      if ((h.shares_number ?? 0) <= 0) continue;
      agg.push({
        ticker: h.ticker,
        company_name: h.company_name,
        market_value: h.market_value ?? 0,
        day_change_pct: h.day_change_pct,
        portfolio_id: v.portfolioId,
      });
    }
  }

  const holdingsValue = agg.reduce((s, h) => s + h.market_value, 0);
  const cashPct = totalValue > 0 ? (totalCash / totalValue) * 100 : 0;

  // Sort by value for the chip grid + concentration check
  const byValue = [...agg].sort((a, b) => b.market_value - a.market_value);

  const holdingsForCard: PrepHolding[] = byValue.slice(0, 8).map((h) => ({
    ticker: h.ticker,
    company_name: h.company_name,
    total_value: h.market_value,
    weight_pct: holdingsValue > 0 ? (h.market_value / holdingsValue) * 100 : 0,
    portfolio_id: h.portfolio_id,
  }));

  const userTickers = new Set(agg.map((h) => h.ticker.toUpperCase()));
  const earningsForUser = earningsAll.filter((e) => userTickers.has(e.symbol.toUpperCase()));
  const openRecsCount = (openRecs ?? []).length;

  const checklist: PrepItem[] = [];

  // 1. Earnings from YOUR holdings — the highest-signal, time-sensitive prep
  for (const e of earningsForUser.slice(0, 4)) {
    const timeLabel = e.hour === "bmo" ? "before open" : e.hour === "amc" ? "after close" : e.date;
    checklist.push({
      id: `earnings-${e.symbol}`,
      label: `${e.symbol} reports ${timeLabel}`,
      detail: e.epsEstimate != null
        ? `Wall Street expects EPS of $${e.epsEstimate.toFixed(2)}. Decide before the print whether to hold through it, trim, or set a stop. Earnings gaps can be sharp.`
        : "Decide before the print whether to hold through it, trim, or set a stop. Earnings moves can be sharp in either direction.",
      type: "earnings",
      href: null,
      cta: `View ${e.symbol} →`,
      ticker: e.symbol,
    });
  }

  // 2. Concentration risk — single largest position over 25% of holdings
  const top = byValue[0];
  const topWeight = top && holdingsValue > 0 ? (top.market_value / holdingsValue) * 100 : 0;
  if (top && topWeight >= 25) {
    checklist.push({
      id: "concentration",
      label: `${top.ticker} is ${topWeight.toFixed(0)}% of your holdings`,
      detail: `A single name driving ${topWeight.toFixed(0)}% of your book means your week rides largely on it. If that is intentional conviction, fine. If it crept up there, consider trimming into strength to reduce single-stock risk.`,
      type: "risk",
      href: null,
      cta: `Review ${top.ticker} →`,
      ticker: top.ticker,
    });
  }

  // 3. Biggest mover to revisit — largest absolute daily swing among holdings
  const movers = agg.filter((h) => h.day_change_pct != null);
  movers.sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0));
  const mover = movers[0];
  if (mover && Math.abs(mover.day_change_pct ?? 0) >= 4) {
    const chg = mover.day_change_pct ?? 0;
    checklist.push({
      id: `mover-${mover.ticker}`,
      label: `${mover.ticker} moved ${chg >= 0 ? "+" : ""}${chg.toFixed(1)}% recently`,
      detail: chg >= 0
        ? `${mover.ticker} ran ${chg.toFixed(1)}%. Check whether the thesis still supports the higher price or if it is time to take some off the table.`
        : `${mover.ticker} dropped ${Math.abs(chg).toFixed(1)}%. Revisit your thesis: is this a buying opportunity, a stop-loss trigger, or noise?`,
      type: "risk",
      href: null,
      cta: `Review ${mover.ticker} →`,
      ticker: mover.ticker,
    });
  }

  // 4. Cash positioning — too much idle, or too thin a buffer
  if (totalValue > 0 && cashPct >= 25) {
    checklist.push({
      id: "cash-deploy",
      label: `${cashPct.toFixed(0)}% of your portfolio is in cash`,
      detail: `You are holding $${totalCash.toLocaleString(undefined, { maximumFractionDigits: 0 })} idle (${cashPct.toFixed(0)}%). That is dry powder for opportunities, but uninvested cash is a drag in a rising market. Consider a plan to deploy it.`,
      type: "action",
      href: firstPortfolioId ? `/portfolios/${firstPortfolioId}` : "/portfolios",
      cta: "Open portfolio →",
      ticker: null,
    });
  } else if (totalValue > 0 && cashPct < 3 && holdingsValue > 0) {
    checklist.push({
      id: "cash-thin",
      label: `Low cash buffer — only ${cashPct.toFixed(1)}% in cash`,
      detail: "You are nearly fully invested. That maximizes exposure but leaves little room to average down or act on a dip without selling something first.",
      type: "info",
      href: firstPortfolioId ? `/portfolios/${firstPortfolioId}` : "/portfolios",
      cta: "Open portfolio →",
      ticker: null,
    });
  }

  // 5. Open AI recommendations — only when some are pending
  if (openRecsCount > 0) {
    checklist.push({
      id: "review-ai-recs",
      label: `${openRecsCount} AI recommendation${openRecsCount > 1 ? "s" : ""} awaiting your call`,
      detail: "You have pending buy/sell signals. Review them over the weekend so you can act at Monday's open instead of scrambling.",
      type: "action",
      href: firstPortfolioId ? `/portfolios/${firstPortfolioId}?tab=ai` : "/portfolios",
      cta: "Go to AI tab →",
      ticker: null,
    });
  }

  // 6. Holdings hygiene — always worth a quick verification before the week
  if (agg.length > 0) {
    checklist.push({
      id: "verify-holdings",
      label: `Confirm your ${agg.length} position${agg.length > 1 ? "s" : ""} and cash are accurate`,
      detail: "Make sure every holding's share count, cost basis, and your cash balance match your brokerage. Accurate inputs are what make the analytics and AI recommendations trustworthy.",
      type: "info",
      href: firstPortfolioId ? `/portfolios/${firstPortfolioId}` : "/portfolios",
      cta: "Review holdings →",
      ticker: null,
    });
  }

  // Empty-book fallback so the card still guides a brand-new user
  if (agg.length === 0) {
    checklist.push({
      id: "add-holdings",
      label: "Add your holdings to unlock weekly prep",
      detail: "Once you add positions, this checklist surfaces earnings on your stocks, concentration risk, big movers to revisit, and cash positioning every weekend.",
      type: "action",
      href: "/portfolios",
      cta: "Add holdings →",
      ticker: null,
    });
  }

  return NextResponse.json({
    checklist,
    holdings: holdingsForCard,
    total_value: totalValue,
    cash_pct: cashPct,
    open_recs_count: openRecsCount,
    earnings_count: earningsForUser.length,
    week_of: from,
    first_portfolio_id: firstPortfolioId,
  });
}
