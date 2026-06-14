import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubEarningsWeek, getFinnhubQuote } from "@/lib/market-data/finnhub";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Next week's Monday and Friday
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

  // Fetch user holdings tickers
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "active");

  const portfolioIds = (portfolios ?? []).map((p) => p.id);

  const [{ data: holdings }, earningsAll, vixy] = await Promise.all([
    portfolioIds.length
      ? supabase
          .from("holdings")
          .select("ticker, total_value")
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

  const checklist: Array<{ item: string; type: "earnings" | "risk" | "action" | "info" }> = [];

  // Earnings alerts for user's holdings
  if (earningsForUser.length > 0) {
    for (const e of earningsForUser.slice(0, 5)) {
      const hour = e.hour === "bmo" ? "before open" : e.hour === "amc" ? "after close" : "";
      checklist.push({
        item: `${e.symbol} reports earnings ${e.date}${hour ? ` (${hour})` : ""}`,
        type: "earnings",
      });
    }
  }

  // VIX context
  checklist.push({
    item: `Volatility is ${vixLabel} (VIXY $${vixLevel.toFixed(2)}) — ${
      vixLevel > 25
        ? "consider tighter position sizing this week"
        : vixLevel < 15
        ? "low fear, good for planned buys"
        : "normal trading conditions expected"
    }`,
    type: "info",
  });

  // Generic prep items
  if (earningsForUser.length === 0) {
    checklist.push({ item: "No earnings from your holdings next week — low event risk", type: "info" });
  }
  checklist.push({ item: "Review open AI recommendations before market open Monday", type: "action" });
  checklist.push({ item: "Check if any holdings are near technical levels (highs, lows, or round numbers)", type: "action" });

  if (vixLevel > 22) {
    checklist.push({ item: "High volatility: avoid chasing momentum — wait for confirmation", type: "risk" });
  }

  return NextResponse.json({
    checklist,
    vix_level: vixLevel,
    vix_label: vixLabel,
    earnings_count: earningsForUser.length,
    week_of: from,
  });
}
