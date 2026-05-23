import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type HoldingInput = { ticker: string; company_name?: string; shares: number; average_cost_basis: number };

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json() as { portfolio_id: string; holdings: HoldingInput[] };

    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", body.portfolio_id)
      .eq("user_id", user.id)
      .single();
    if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

    const errors: string[] = [];

    for (const h of body.holdings) {
      const ticker = h.ticker.toUpperCase().trim();
      if (!ticker) continue;

      const { data: existing } = await supabase
        .from("holdings")
        .select("id")
        .eq("portfolio_id", body.portfolio_id)
        .eq("ticker", ticker)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from("holdings").update({
          shares: h.shares,
          average_cost_basis: h.average_cost_basis,
          company_name: h.company_name || null,
        }).eq("id", existing.id);
        if (error) errors.push(`${ticker}: ${error.message}`);
      } else {
        const { error } = await supabase.from("holdings").insert({
          portfolio_id: body.portfolio_id,
          ticker,
          company_name: h.company_name || null,
          asset_type: "stock",
          shares: h.shares,
          average_cost_basis: h.average_cost_basis,
        });
        if (error) errors.push(`${ticker}: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
