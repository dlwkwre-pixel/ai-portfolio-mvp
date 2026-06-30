import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFmpQuotes } from "@/lib/market-data/fmp";

const REALERT_DAYS = 14; // don't re-alert the same target within two weeks

// Vercel Cron (daily). Checks every watchlist item with a price target, batches
// the quote lookups through FMP, and pings the owner when a target is hit.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try { supabase = createAdminClient(); } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 500 });
  }

  const { data: rows, error } = await supabase
    .from("watchlist")
    .select("id, user_id, ticker, target_price, alert_direction, last_alerted_at")
    .not("target_price", "is", null)
    .then((r) => r, () => ({ data: null, error: { message: "table missing" } }));
  if (error) return NextResponse.json({ error: error.message }, { status: 200 });
  if (!rows || rows.length === 0) return NextResponse.json({ message: "No targets to check." });

  // Batched quotes (FMP supports comma-separated symbols; chunk to be safe).
  const tickers = [...new Set(rows.map((r) => (r.ticker as string).toUpperCase()))];
  const priceByTicker = new Map<string, number>();
  for (let i = 0; i < tickers.length; i += 50) {
    const chunk = tickers.slice(i, i + 50);
    try {
      const q = await getFmpQuotes(chunk);
      for (const [t, v] of q) priceByTicker.set(t, v.price);
    } catch { /* skip chunk */ }
  }

  const now = Date.now();
  const money = (n: number) => "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let alerted = 0;

  for (const r of rows) {
    const price = priceByTicker.get((r.ticker as string).toUpperCase());
    const target = Number(r.target_price);
    if (price == null || !Number.isFinite(target)) continue;

    const hit = r.alert_direction === "above" ? price >= target : price <= target;
    if (!hit) continue;

    const last = r.last_alerted_at ? new Date(r.last_alerted_at as string).getTime() : 0;
    if (last && now - last < REALERT_DAYS * 86400_000) continue;

    const dir = r.alert_direction === "above" ? "rose to" : "dropped to";
    const { error: notifErr } = await supabase.from("app_notifications").insert({
      title: `${r.ticker} hit your target 🎯`,
      body: `${r.ticker} ${dir} ${money(price)} — your watchlist target was ${money(target)}. Open the Watchlist to run an AI news scan before you act.`,
      target_user_id: r.user_id,
    });
    if (notifErr) continue;
    await supabase.from("watchlist").update({ last_alerted_at: new Date().toISOString() }).eq("id", r.id);
    alerted++;
  }

  return NextResponse.json({ message: `Checked ${rows.length} target(s), sent ${alerted} alert(s).` });
}
