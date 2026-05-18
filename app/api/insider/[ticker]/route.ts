import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinnhubInsiderTransactions } from "@/lib/market-data/finnhub";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const symbol = ticker.trim().toUpperCase();

  const data = await getFinnhubInsiderTransactions(symbol);
  if (!data) {
    return NextResponse.json({ transactions: [], netBuys: 0, netSells: 0, signal: "neutral" });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
