import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubEarningsWeek, getFinnhubQuote } from "@/lib/market-data/finnhub";

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
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(5);

  const portfolioIds = (portfolios ?? []).map((p) => p.id);
  const firstPortfolioId = portfolioIds[0] ?? null;

  const [{ data: holdings }, { data: openRecs }, earningsAll, vixy] = await Promise.all([
    portfolioIds.length
      ? supabase
          .from("holdings")
          .select("ticker, company_name, total_value, portfolio_id")
          .in("portfolio_id", portfolioIds)
          .gt("shares", 0)
          .order("total_value", { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
    portfolioIds.length
      ? supabase
          .from("recommendation_items")
          .select("id, portfolio_id, action_type, ticker")
          .in("portfolio_id", portfolioIds)
          .eq("recommendation_status", "proposed")
          .limit(20)
      : Promise.resolve({ data: [] }),
    getFinnhubEarningsWeek(from, to),
    getFinnhubQuote("VIXY"),
  ]);

  const allHoldings = (holdings ?? []) as Array<{
    ticker: string;
    company_name: string | null;
    total_value: number;
    portfolio_id: string;
  }>;

  const totalHoldingsValue = allHoldings.reduce((s, h) => s + (h.total_value ?? 0), 0);

  const holdingsForCard: PrepHolding[] = allHoldings.slice(0, 8).map((h) => ({
    ticker: h.ticker,
    company_name: h.company_name ?? null,
    total_value: h.total_value ?? 0,
    weight_pct: totalHoldingsValue > 0 ? ((h.total_value ?? 0) / totalHoldingsValue) * 100 : 0,
    portfolio_id: h.portfolio_id,
  }));

  const userTickers = new Set(allHoldings.map((h) => h.ticker.toUpperCase()));
  const earningsForUser = earningsAll.filter((e) => userTickers.has(e.symbol.toUpperCase()));
  const openRecsCount = (openRecs ?? []).length;

  const vixLevel = vixy?.c ?? 0;
  const vixLabel =
    vixLevel < 15 ? "calm" : vixLevel < 22 ? "moderate" : vixLevel < 30 ? "elevated" : "extreme";

  const checklist: PrepItem[] = [];

  // Earnings for user's holdings
  for (const e of earningsForUser.slice(0, 4)) {
    const timeLabel = e.hour === "bmo" ? "before open" : e.hour === "amc" ? "after close" : e.date;
    checklist.push({
      id: `earnings-${e.symbol}`,
      label: `${e.symbol} reports ${timeLabel}`,
      detail: e.epsEstimate != null
        ? `EPS estimate: $${e.epsEstimate.toFixed(2)}. Decide whether to hold or trim before the report.`
        : "Decide whether to hold or trim your position before the report.",
      type: "earnings",
      href: `/research?q=${e.symbol}`,
      cta: `Research ${e.symbol} →`,
    });
  }

  if (earningsForUser.length === 0) {
    checklist.push({
      id: "no-earnings",
      label: "No earnings from your holdings next week",
      detail: "Low event risk from your current positions.",
      type: "info",
      href: null,
      cta: null,
    });
  }

  // VIX context
  checklist.push({
    id: "vix-context",
    label: `Volatility is ${vixLabel} — VIXY $${vixLevel.toFixed(2)}`,
    detail:
      vixLevel > 25
        ? "Elevated fear in the market. Consider tighter position sizing and avoid chasing momentum."
        : vixLevel < 15
        ? "Low fear environment. Favorable conditions for planned entries or rebalancing."
        : "Normal trading conditions expected next week.",
    type: vixLevel > 25 ? "risk" : "info",
    href: vixLevel > 25 && firstPortfolioId ? `/portfolios/${firstPortfolioId}?tab=ai` : null,
    cta: vixLevel > 25 ? "Run stress test →" : null,
  });

  // AI recs — only if there are open ones
  if (openRecsCount > 0) {
    checklist.push({
      id: "review-ai-recs",
      label: `${openRecsCount} open AI recommendation${openRecsCount > 1 ? "s" : ""} pending`,
      detail: "Review your pending buy/sell signals before Monday's open so you can act quickly.",
      type: "action",
      href: firstPortfolioId ? `/portfolios/${firstPortfolioId}?tab=ai` : "/portfolios",
      cta: "Go to AI tab →",
    });
  }

  // High vol extra warning
  if (vixLevel > 22) {
    checklist.push({
      id: "high-vol-warning",
      label: "Avoid chasing momentum this week",
      detail: `Elevated volatility (VIXY $${vixLevel.toFixed(2)}) means reactive markets. Wait for price confirmation before adding to winners.`,
      type: "risk",
      href: null,
      cta: null,
    });
  }

  return NextResponse.json({
    checklist,
    holdings: holdingsForCard,
    vix_level: vixLevel,
    vix_label: vixLabel,
    open_recs_count: openRecsCount,
    earnings_count: earningsForUser.length,
    week_of: from,
    first_portfolio_id: firstPortfolioId,
  });
}
