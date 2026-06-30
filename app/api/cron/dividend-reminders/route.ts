import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFmpDividendCalendar, type FmpCalendarDividend } from "@/lib/market-data/fmp";

// Vercel Cron (daily). Uses ONE market-wide FMP dividend-calendar call, finds
// dividends paying today, matches them to users' holdings, and nudges each
// owner to log the payout (we can't see brokerages, so logging is manual).
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
  const from = new Date(Date.now() - 40 * 86400_000).toISOString().slice(0, 10);

  let calendar: FmpCalendarDividend[] = [];
  try { calendar = await getFmpDividendCalendar(from, today); } catch { calendar = []; }
  // Dividends whose payment date is today.
  const payingToday = calendar.filter((d) => d.paymentDate === today && d.perShare > 0);
  if (payingToday.length === 0) return NextResponse.json({ message: "No dividends paying today." });

  const perShareBySymbol = new Map<string, number>();
  for (const d of payingToday) {
    if (!perShareBySymbol.has(d.symbol)) perShareBySymbol.set(d.symbol, d.perShare);
  }
  const symbols = [...perShareBySymbol.keys()];

  // Active portfolios → user map.
  const { data: ports } = await supabase
    .from("portfolios").select("id, user_id, name").eq("is_active", true).limit(8000)
    .then((r) => r, () => ({ data: null }));
  if (!ports || ports.length === 0) return NextResponse.json({ message: "No portfolios." });
  const portById = new Map(ports.map((p) => [p.id as string, p as { id: string; user_id: string; name: string }]));

  // Holdings that match a paying ticker.
  const { data: holdings } = await supabase
    .from("holdings").select("portfolio_id, ticker, shares")
    .in("ticker", symbols.length ? symbols : ["__none__"]).limit(20000)
    .then((r) => r, () => ({ data: null }));
  if (!holdings || holdings.length === 0) return NextResponse.json({ message: "No matching holdings." });

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

  return NextResponse.json({ message: `Sent ${notified} dividend reminder(s).`, payingToday: payingToday.length });
}
