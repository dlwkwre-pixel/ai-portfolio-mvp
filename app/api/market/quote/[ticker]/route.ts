import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";

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
    const quote = await getFinnhubQuote(sym);
    if (!quote || quote.c <= 0) {
      return NextResponse.json({ error: "No price data" }, { status: 404 });
    }
    return NextResponse.json(
      { ticker: sym, price: quote.c, change_pct: quote.dp ?? null },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json({ error: "Quote fetch failed" }, { status: 502 });
  }
}
