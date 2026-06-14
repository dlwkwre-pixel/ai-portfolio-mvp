import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPolygonEODBatch } from "@/lib/market-data/polygon";

// Allow up to 5 minutes — Polygon free tier is slow (5 calls/min per ticker)
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: portfolioId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id, cash_balance, created_at")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

  // Load stock holdings (skip crypto — CoinGecko handles those live)
  const { data: holdingsRaw } = await supabase
    .from("holdings")
    .select("ticker, shares, asset_type, opened_at")
    .eq("portfolio_id", portfolioId);

  const holdings = (holdingsRaw ?? []).filter(
    (h) => h.asset_type !== "crypto" && Number(h.shares ?? 0) > 0
  );

  if (holdings.length === 0) {
    return NextResponse.json({ message: "No stock holdings to backfill.", inserted: 0 });
  }

  // Date range: earliest holding purchase → yesterday
  const earliestOpenedAt = holdings.reduce((min, h) => {
    const d = h.opened_at ? h.opened_at.slice(0, 10) : portfolio.created_at.slice(0, 10);
    return d < min ? d : min;
  }, portfolio.created_at.slice(0, 10));

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (earliestOpenedAt >= yesterday) {
    return NextResponse.json({ message: "Portfolio is too new to backfill.", inserted: 0 });
  }

  // Find which dates already have snapshots (to avoid duplicates)
  const { data: existingSnaps } = await supabase
    .from("portfolio_snapshots")
    .select("snapshot_date")
    .eq("portfolio_id", portfolioId)
    .gte("snapshot_date", earliestOpenedAt)
    .lte("snapshot_date", yesterday + "T23:59:59");

  const existingDates = new Set(
    (existingSnaps ?? []).map((s) => s.snapshot_date.slice(0, 10))
  );

  // Fetch Polygon EOD for all stock tickers
  const tickers = [...new Set(holdings.map((h) => h.ticker.toUpperCase()))];
  const priceTable = await getPolygonEODBatch(tickers, earliestOpenedAt, yesterday);

  // Build set of tradeable days (dates where at least one ticker has a price)
  const tradingDays = new Set<string>();
  for (const prices of priceTable.values()) {
    for (const date of prices.keys()) tradingDays.add(date);
  }

  // Build snapshots for missing trading days
  const cashBalance = Number(portfolio.cash_balance ?? 0);
  const admin = createAdminClient();

  let inserted = 0;
  const snapshots: { portfolio_id: string; total_value: number; cash_balance: number; snapshot_date: string; notes: string }[] = [];

  for (const date of [...tradingDays].sort()) {
    if (existingDates.has(date)) continue;

    let holdingsValue = cashBalance;
    for (const holding of holdings) {
      const ticker = holding.ticker.toUpperCase();
      const openedDate = holding.opened_at ? holding.opened_at.slice(0, 10) : earliestOpenedAt;
      if (date < openedDate) continue; // holding didn't exist yet
      const price = priceTable.get(ticker)?.get(date);
      if (!price) continue;
      holdingsValue += Number(holding.shares) * price;
    }

    if (!Number.isFinite(holdingsValue) || holdingsValue <= 0) continue;

    snapshots.push({
      portfolio_id: portfolioId,
      total_value: Math.round(holdingsValue * 100) / 100,
      cash_balance: cashBalance,
      snapshot_date: `${date}T12:00:00Z`,
      notes: "Polygon backfill",
    });
  }

  // Batch insert in chunks of 100
  for (let i = 0; i < snapshots.length; i += 100) {
    const chunk = snapshots.slice(i, i + 100);
    const { error } = await admin.from("portfolio_snapshots").insert(chunk);
    if (!error) inserted += chunk.length;
  }

  return NextResponse.json({
    message: `Backfill complete.`,
    tickers: tickers.length,
    tradingDays: tradingDays.size,
    inserted,
    skipped: tradingDays.size - snapshots.length,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: portfolioId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

  const { data: toDelete } = await supabase
    .from("portfolio_snapshots")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .eq("notes", "Polygon backfill");

  const count = toDelete?.length ?? 0;
  if (count > 0) {
    await supabase
      .from("portfolio_snapshots")
      .delete()
      .eq("portfolio_id", portfolioId)
      .eq("notes", "Polygon backfill");
  }

  return NextResponse.json({ deleted: count });
}
