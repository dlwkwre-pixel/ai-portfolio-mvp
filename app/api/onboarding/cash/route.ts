import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json() as { portfolio_id: string; cash_amount: number };

    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", body.portfolio_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

    const amount = Math.max(0, body.cash_amount ?? 0);
    const { error } = await supabase
      .from("portfolios")
      .update({ cash_balance: amount })
      .eq("id", body.portfolio_id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
