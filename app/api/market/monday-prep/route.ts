import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubEarningsWeek, getFinnhubQuote } from "@/lib/market-data/finnhub";

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
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(5);

  const portfolioIds = (portfolios ?? []).map((p) => p.id);
  const firstPortfolioId = portfolioIds[0] ?? null;

  const [{ data: holdings }, earningsAll, vixy] = await Promise.all([
    portfolioIds.length
      ? supabase
          .from("holdings")
          .select("ticker, portfolio_id, total_value")
          .in("portfolio_id", portfolioIds)
          .gt("shares", 0)
          .order("total_value", { ascending: false })
      : Promise.resolve({ data: [] }),
    getFinnhubEarningsWeek(from, to),
    getFinnhubQuote("VIXY"),
  ]);

  const userTickers = new Set((holdings ?? []).map((h) => h.ticker.toUpperCase()));
  const earningsForUser = earningsAll.filter((e) => userTickers.has(e.symbol.toUpperCase()));

  const vixLevel = vixy?.c ?? 0;
  const vixLabel =
    vixLevel < 15 ? "calm" : vixLevel < 22 ? "moderate" : vixLevel < 30 ? "elevated" : "extreme";

  const checklist: PrepItem[] = [];

  // Earnings for user's holdings — link to research for each ticker
  for (const e of earningsForUser.slice(0, 4)) {
    const timeLabel = e.hour === "bmo" ? "before open" : e.hour === "amc" ? "after close" : e.date;
    checklist.push({
      id: `earnings-${e.symbol}`,
      label: `${e.symbol} reports ${timeLabel}`,
      detail: e.epsEstimate != null
        ? `EPS estimate: $${e.epsEstimate.toFixed(2)}. Review your position size before the report.`
        : "Review your position size and decide whether to hold or trim before the report.",
      type: "earnings",
      href: `/research?q=${e.symbol}`,
      cta: `Research ${e.symbol} →`,
    });
  }

  // No earnings
  if (earningsForUser.length === 0) {
    checklist.push({
      id: "no-earnings",
      label: "No earnings from your holdings next week",
      detail: "Low event risk. Good week to focus on portfolio maintenance.",
      type: "info",
      href: null,
      cta: null,
    });
  }

  // VIX context
  checklist.push({
    id: "vix-context",
    label: `Volatility is ${vixLabel} (VIXY $${vixLevel.toFixed(2)})`,
    detail:
      vixLevel > 25
        ? "Elevated fear. Consider tighter position sizing and avoid chasing momentum moves."
        : vixLevel < 15
        ? "Low fear environment. Good conditions for planned buys or rebalancing."
        : "Normal trading conditions. No unusual caution required.",
    type: vixLevel > 25 ? "risk" : "info",
    href: firstPortfolioId ? `/portfolios/${firstPortfolioId}?tab=ai` : null,
    cta: vixLevel > 25 ? "Run stress test →" : null,
  });

  // Review AI recommendations
  checklist.push({
    id: "review-ai-recs",
    label: "Review open AI recommendations",
    detail: "Check any pending buy, sell, or hold signals before Monday's open.",
    type: "action",
    href: firstPortfolioId ? `/portfolios/${firstPortfolioId}?tab=ai` : "/portfolios",
    cta: "Go to AI tab →",
  });

  // Check technicals
  checklist.push({
    id: "check-technicals",
    label: "Scan your holdings for technical levels",
    detail: "Look for positions near 52-week highs/lows or major round numbers — potential breakout or reversal zones.",
    type: "action",
    href: "/research",
    cta: "Open Research →",
  });

  // High vol extra warning
  if (vixLevel > 22) {
    checklist.push({
      id: "high-vol-warning",
      label: "Avoid chasing momentum this week",
      detail: `VIXY at $${vixLevel.toFixed(2)} suggests reactive markets. Wait for confirmation before adding to winners.`,
      type: "risk",
      href: null,
      cta: null,
    });
  }

  return NextResponse.json({
    checklist,
    vix_level: vixLevel,
    vix_label: vixLabel,
    earnings_count: earningsForUser.length,
    week_of: from,
    first_portfolio_id: firstPortfolioId,
  });
}
