import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type StrategyInput = {
  name: string;
  description: string;
  style: string;
  risk_level: string;
  prompt_text: string;
  max_position_pct: number;
  min_position_pct: number;
  cash_min_pct: number;
  cash_max_pct: number;
  turnover_preference: string;
  holding_period_bias: string;
};

// POST body: { portfolio_id, mode: "create", strategy: StrategyInput }
//         | { portfolio_id, mode: "assign", strategy_id: string }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json() as
      | { portfolio_id: string; mode: "create"; strategy: StrategyInput }
      | { portfolio_id: string; mode: "assign"; strategy_id: string };

    // Deactivate any prior assignment
    await supabase
      .from("portfolio_strategy_assignments")
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq("portfolio_id", body.portfolio_id)
      .eq("is_active", true);

    if (body.mode === "assign") {
      const { data: version } = await supabase
        .from("strategy_versions")
        .select("id")
        .eq("strategy_id", body.strategy_id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();
      if (!version) return NextResponse.json({ error: "Strategy version not found" }, { status: 404 });

      const { error } = await supabase.from("portfolio_strategy_assignments").insert({
        portfolio_id: body.portfolio_id,
        strategy_id: body.strategy_id,
        strategy_version_id: version.id,
        is_active: true,
        assigned_at: new Date().toISOString(),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // mode === "create"
    const s = body.strategy;
    const { data: strategy, error: sErr } = await supabase
      .from("strategies")
      .insert({
        user_id: user.id,
        name: s.name,
        description: s.description || null,
        style: s.style || null,
        risk_level: s.risk_level || null,
        is_active: true,
      })
      .select("id")
      .single();
    if (sErr || !strategy) return NextResponse.json({ error: sErr?.message || "Failed to create strategy" }, { status: 500 });

    const { data: version, error: vErr } = await supabase
      .from("strategy_versions")
      .insert({
        strategy_id: strategy.id,
        version_number: 1,
        prompt_text: s.prompt_text || null,
        max_position_pct: s.max_position_pct,
        min_position_pct: s.min_position_pct,
        cash_min_pct: s.cash_min_pct,
        cash_max_pct: s.cash_max_pct,
        turnover_preference: s.turnover_preference || null,
        holding_period_bias: s.holding_period_bias || null,
        allow_fractional_shares: false,
      })
      .select("id")
      .single();
    if (vErr || !version) return NextResponse.json({ error: vErr?.message || "Failed to create strategy version" }, { status: 500 });

    const { error: assignErr } = await supabase.from("portfolio_strategy_assignments").insert({
      portfolio_id: body.portfolio_id,
      strategy_id: strategy.id,
      strategy_version_id: version.id,
      is_active: true,
      assigned_at: new Date().toISOString(),
    });
    if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, strategy_id: strategy.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
