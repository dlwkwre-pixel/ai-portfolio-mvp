import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recent real logged trading decisions for a strategy's assigned portfolio(s)
// — shown next to backtest results so a viewer can eyeball simulated vs.
// actual, not a rigorous statistical comparison (too few live trades for
// that yet, especially for a freshly-forked agentic strategy).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const strategyId = req.nextUrl.searchParams.get("strategy_id");
  if (!strategyId) return NextResponse.json({ error: "strategy_id is required." }, { status: 400 });

  const { data: assignments } = await supabase
    .from("portfolio_strategy_assignments")
    .select("portfolio_id")
    .eq("strategy_id", strategyId)
    .eq("is_active", true)
    .is("ended_at", null);

  const portfolioIds = [...new Set((assignments ?? []).map((a) => a.portfolio_id as string))];
  if (portfolioIds.length === 0) {
    return NextResponse.json({ decisions: [] });
  }

  const { data: decisions, error } = await supabase
    .from("trading_decision_log")
    .select("id, portfolio_id, ticker, action, reasoning, source, created_at")
    .eq("user_id", user.id)
    .in("portfolio_id", portfolioIds)
    .order("created_at", { ascending: false })
    .limit(15);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ decisions: decisions ?? [] });
}
