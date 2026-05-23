import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json() as { name?: string; account_type?: string; description?: string };
    const name = (body.name ?? "").trim() || "My Portfolio";
    const account_type = body.account_type ?? "brokerage";

    // Idempotency: return existing portfolio with same name
    const { data: existing } = await supabase
      .from("portfolios")
      .select("id, is_active")
      .eq("user_id", user.id)
      .eq("name", name)
      .maybeSingle();

    if (existing) {
      if (!existing.is_active) {
        await supabase
          .from("portfolios")
          .update({ is_active: true, status: "active" })
          .eq("id", existing.id)
          .eq("user_id", user.id);
      }
      return NextResponse.json({ id: existing.id });
    }

    const { data: portfolio, error } = await supabase
      .from("portfolios")
      .insert({
        user_id: user.id,
        name,
        account_type,
        description: body.description || null,
        benchmark_symbol: "SPY",
        cash_balance: 0,
        status: "active",
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !portfolio) {
      return NextResponse.json({ error: error?.message || "Failed to create portfolio" }, { status: 500 });
    }

    return NextResponse.json({ id: portfolio.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
