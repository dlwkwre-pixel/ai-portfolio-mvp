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
  const recent: Event[] = [];

  await Promise.all(rows.map(async (h) => {
    const shares = Number(h.shares);
    let divs;
    try { divs = await getFmpDividends(h.ticker); } catch { return; }
    if (!divs || divs.length === 0) return;

    // Upcoming: any declared dividend with an ex- or pay-date in the future (next 120 days).
    for (const d of divs) {
      const days = daysFromToday(d.paymentDate ?? d.exDate);
      if (days >= 0 && days <= 120) {
        upcoming.push({ ticker: h.ticker, shares, perShare: d.perShare, estAmount: shares * d.perShare, exDate: d.exDate, payDate: d.paymentDate });
        return; // one upcoming per holding is enough
      }
    }
    // Otherwise surface the most recent payout in the last 60 days as a "log it" candidate.
    const latest = divs[0];
    const payRef = latest.paymentDate ?? latest.exDate;
    const days = daysFromToday(payRef);
    if (days <= 0 && days >= -60) {
      recent.push({ ticker: h.ticker, shares, perShare: latest.perShare, estAmount: shares * latest.perShare, exDate: latest.exDate, payDate: latest.paymentDate });
    }
  }));

  upcoming.sort((a, b) => (a.payDate ?? a.exDate).localeCompare(b.payDate ?? b.exDate));
  recent.sort((a, b) => (b.payDate ?? b.exDate).localeCompare(a.payDate ?? a.exDate));

  return NextResponse.json({
    upcoming: upcoming.map((e) => ({ ...e, estAmount: Math.round(e.estAmount * 100) / 100 })),
    recent: recent.map((e) => ({ ...e, estAmount: Math.round(e.estAmount * 100) / 100 })),
  });
}
