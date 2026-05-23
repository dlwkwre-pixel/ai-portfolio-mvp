import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCongressTrades } from "@/lib/market-data/quiver";

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

  const trades = await getCongressTrades(sym);

  return NextResponse.json(
    { ticker: sym, trades, count: trades.length },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=43200" } }
  );
}
