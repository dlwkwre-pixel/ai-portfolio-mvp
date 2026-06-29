import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubQuote, getFinnhubProfile, getFinnhubFactorMetrics } from "@/lib/market-data/finnhub";

export const dynamic = "force-dynamic";

// Lightweight metadata for a ticker the user wants to add in the what-if
// simulator: live price, sector label, and beta. All free Finnhub.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || symbol.length > 12) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  const [quote, profile, metrics] = await Promise.all([
    getFinnhubQuote(symbol).catch(() => null),
    getFinnhubProfile(symbol).catch(() => null),
    getFinnhubFactorMetrics(symbol).catch(() => null),
  ]);

  if (!quote || !quote.c || quote.c <= 0) {
    return NextResponse.json({ error: `No live price for ${symbol}` }, { status: 404 });
  }

  return NextResponse.json({
    ticker: symbol,
    name: profile?.name ?? symbol,
    price: quote.c,
    sector: profile?.industry ?? "Other / Fund",
    beta: metrics?.beta ?? null,
  }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
}
