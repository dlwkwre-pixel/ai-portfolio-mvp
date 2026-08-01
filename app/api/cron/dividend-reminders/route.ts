import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFmpDividends } from "@/lib/market-data/fmp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron (daily). FMP's market-wide dividend-calendar endpoint is gated behind
// a higher subscription tier on the /stable API (402 Premium) — see getFmpDividendCalendar.
// Instead of one calendar call, this fetches every distinct ticker actually held across
// active portfolios and checks each one's per-symbol dividend history (the endpoint
// that IS available on this plan), batched to stay rate-friendly. More requests than
// the old approach, but bounded by real distinct holdings, not the whole market.
// This plan tier's rate limit is low enough to 429 after a handful of rapid
// requests (observed directly against /stable/dividends) — a daily cron has no
// urgency, so stay conservative rather than silently miss tickers to throttling.
const TICKER_BATCH_SIZE = 2;
const TICKER_BATCH_DELAY_MS = 1200;
const MAX_TICKERS = 300; // safety net against a pathological fan-out

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try { supabase = createAdminClient(); } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);

  // Active portfolios → user map.
  const { data: ports } = await supabase
    .from("portfolios").select("id, user_id, name").eq("is_active", true).limit(8000)
    .then((r) => r, () => ({ data: null }));
  if (!ports || ports.length === 0) return NextResponse.json({ message: "No portfolios." });
  const portById = new Map(ports.map((p) => [p.id as string, p as { id: string; user_id: string; name: string }]));

  // All holdings across active portfolios (shares > 0).
  const { data: holdings } = await supabase
    .from("holdings").select("portfolio_id, ticker, shares")
    .gt("shares", 0).limit(20000)
    .then((r) => r, () => ({ data: null }));
  if (!holdings || holdings.length === 0) return NextResponse.json({ message: "No holdings." });

  const distinctTickers = [...new Set(holdings.map((h) => String(h.ticker ?? "").toUpperCase()).filter(Boolean))].slice(0, MAX_TICKERS);
  if (distinctTickers.length === 0) return NextResponse.json({ message: "No holdings." });

  // Check each held ticker's dividend history for a payment landing today.
  const perShareBySymbol = new Map<string, number>();
  for (let i = 0; i < distinctTickers.length; i += TICKER_BATCH_SIZE) {
    const batch = distinctTickers.slice(i, i + TICKER_BATCH_SIZE);
    await Promise.all(batch.map(async (ticker) => {
      try {
        const divs = await getFmpDividends(ticker);
        const payingToday = divs.find((d) => d.paymentDate === today && d.perShare > 0);
        if (payingToday) perShareBySymbol.set(ticker, payingToday.perShare);
      } catch { /* skip ticker */ }
    }));
    if (i + TICKER_BATCH_SIZE < distinctTickers.length) await new Promise((r) => setTimeout(r, TICKER_BATCH_DELAY_MS));
  }

  if (perShareBySymbol.size === 0) return NextResponse.json({ message: "No dividends paying today." });

  const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let notified = 0;

  for (const h of holdings) {
    const port = portById.get(h.portfolio_id as string);
    if (!port) continue;
    const perShare = perShareBySymbol.get((h.ticker as string).toUpperCase());
    if (!perShare) continue;
    const shares = Number(h.shares ?? 0);
    if (shares <= 0) continue;
    const est = shares * perShare;

    const { error } = await supabase.from("app_notifications").insert({
      title: `${h.ticker} paid a dividend 💵`,
      body: `${h.ticker} paid ~${money(est)} today (${shares} sh × ${money(perShare)}) into "${port.name}". Open the Income tab to log it and track your dividend income.`,
      target_user_id: port.user_id,
    });
    if (!error) notified++;
  }

  return NextResponse.json({ message: `Sent ${notified} dividend reminder(s).`, tickersPayingToday: perShareBySymbol.size });
}
