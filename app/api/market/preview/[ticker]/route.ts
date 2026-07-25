import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getFinnhubQuote, getFinnhubProfile, getFinnhubMetrics, getFinnhubRecommendations,
} from "@/lib/market-data/finnhub";

// Lightweight snapshot for the Community "ticker preview" popover — price,
// a couple of quick stats, and analyst consensus. Deliberately cheap: no
// SEC EDGAR fundamentals here, this backs a quick-glance modal, not the
// full /research page.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const sym = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!sym) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  try {
    const [quote, profile, metrics, rec] = await Promise.all([
      getFinnhubQuote(sym),
      getFinnhubProfile(sym),
      getFinnhubMetrics(sym),
      getFinnhubRecommendations(sym),
    ]);

    if (!quote || quote.c <= 0) {
      return NextResponse.json({ error: "No price data" }, { status: 404 });
    }

    const consensus = rec && (rec.buy + rec.hold + rec.sell + rec.strongBuy + rec.strongSell) > 0
      ? { strongBuy: rec.strongBuy, buy: rec.buy, hold: rec.hold, sell: rec.sell, strongSell: rec.strongSell }
      : null;

    return NextResponse.json(
      {
        ticker: sym,
        companyName: profile?.name ?? null,
        price: quote.c,
        changePct: quote.dp ?? null,
        marketCap: profile?.marketCap ?? null,
        peRatio: metrics?.peRatio ?? null,
        weekHigh52: metrics?.weekHigh52 ?? null,
        weekLow52: metrics?.weekLow52 ?? null,
        consensus,
      },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json({ error: "Preview fetch failed" }, { status: 502 });
  }
}
