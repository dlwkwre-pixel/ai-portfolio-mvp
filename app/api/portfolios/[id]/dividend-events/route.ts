import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFmpDividends } from "@/lib/market-data/fmp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Event = {
  ticker: string;
  shares: number;
  perShare: number;
  estAmount: number;
  exDate: string;
  payDate: string | null;
};

function daysFromToday(iso: string): number {
  const d = new Date(iso + "T00:00:00").getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / 86_400_000);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: holdings } = await supabase
    .from("holdings").select("ticker, asset_type, shares").eq("portfolio_id", id);
  const rows = (holdings ?? [])
    .filter((h) => h.asset_type !== "manual" && h.asset_type !== "crypto" && Number(h.shares) > 0)
    .slice(0, 20);
  if (rows.length === 0) return NextResponse.json({ upcoming: [], recent: [] });

  const upcoming: Event[] = [];
  let recent: Event[] = [];

  await Promise.all(rows.map(async (h) => {
    const shares = Number(h.shares);
    let divs;
    try { divs = await getFmpDividends(h.ticker); } catch { return; } // FMP down for this ticker → skip it
    if (!divs || divs.length === 0) return;

    let hasUpcoming = false;
    for (const d of divs) {
      const ref = d.paymentDate ?? d.exDate;
      if (!ref) continue;
      const days = daysFromToday(ref);
      const estAmount = Math.round(shares * d.perShare * 100) / 100;
      if (estAmount <= 0) continue;
      if (days >= 0 && days <= 120) {
        if (!hasUpcoming) { upcoming.push({ ticker: h.ticker, shares, perShare: d.perShare, estAmount, exDate: d.exDate, payDate: d.paymentDate }); hasUpcoming = true; }
      } else if (days < 0 && days >= -100) {
        // Every payout in the last ~100 days is a "log it" candidate (dedup happens below).
        recent.push({ ticker: h.ticker, shares, perShare: d.perShare, estAmount, exDate: d.exDate, payDate: d.paymentDate });
      }
    }
  }));

  // Dedup: drop any recent payout that already has a matching logged dividend, so a
  // reload never re-offers an entry the user already recorded (which would double-count
  // it now that dividends flow into returns). We match on pay-date + amount because the
  // one-tap logger writes exactly effective_at=payDate and amount=estAmount. Best-effort:
  // if the ledger read fails, we simply skip dedup rather than break the calendar.
  try {
    const { data: logged } = await supabase
      .from("cash_ledger")
      .select("amount, effective_at")
      .eq("portfolio_id", id).eq("reason", "dividend").eq("direction", "IN");
    if (logged && logged.length > 0) {
      const seen = new Set(
        logged.map((l) => `${String(l.effective_at).slice(0, 10)}|${Number(l.amount).toFixed(2)}`),
      );
      recent = recent.filter((e) => {
        const key = `${String(e.payDate ?? e.exDate).slice(0, 10)}|${e.estAmount.toFixed(2)}`;
        return !seen.has(key);
      });
    }
  } catch { /* dedup is best-effort */ }

  upcoming.sort((a, b) => (a.payDate ?? a.exDate).localeCompare(b.payDate ?? b.exDate));
  recent.sort((a, b) => (b.payDate ?? b.exDate).localeCompare(a.payDate ?? a.exDate));

  return NextResponse.json({
    upcoming: upcoming.map((e) => ({ ...e, estAmount: Math.round(e.estAmount * 100) / 100 })),
    recent: recent.slice(0, 15).map((e) => ({ ...e, estAmount: Math.round(e.estAmount * 100) / 100 })),
  });
}
