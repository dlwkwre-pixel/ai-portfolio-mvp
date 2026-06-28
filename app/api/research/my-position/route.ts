import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// For a given ticker, return whether the signed-in user owns it and their most recent
// PERSONALIZED portfolio recommendation (from a recommendation run). Lets the research page
// show "your portfolio's call" — which, unlike the generic research take, is strategy-aware.

type OwnedJoin = { shares: number | null; portfolios: { id: string; name: string | null } | { id: string; name: string | null }[] | null };

function verdictFromAction(action: string | null): "BUY" | "SELL" | "TRIM" | "HOLD" | null {
  const a = (action ?? "").toLowerCase();
  if (a === "buy" || a === "add") return "BUY";
  if (a === "sell") return "SELL";
  if (a === "trim") return "TRIM";
  if (a === "hold" || a === "watch") return "HOLD";
  return null;
}

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return NextResponse.json({ owned: false, rec: null });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ owned: false, rec: null });

  const [recRes, ownedRes] = await Promise.all([
    supabase
      .from("recommendation_items")
      .select("action_type, conviction, target_price_1, created_at, portfolio_id")
      .eq("user_id", user.id)
      .eq("ticker", ticker)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("holdings")
      .select("shares, portfolios!inner(id, name, user_id)")
      .eq("ticker", ticker)
      .eq("portfolios.user_id", user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  const recRow = recRes.data as { action_type?: string | null; conviction?: string | null; target_price_1?: number | null; created_at?: string; portfolio_id?: string | null } | null;
  const ownedRow = ownedRes.data as OwnedJoin | null;
  const ownedPortfolio = ownedRow
    ? (Array.isArray(ownedRow.portfolios) ? ownedRow.portfolios[0] : ownedRow.portfolios)
    : null;

  const verdict = recRow ? verdictFromAction(recRow.action_type ?? null) : null;
  const rec = recRow && verdict
    ? {
        verdict,
        conviction: recRow.conviction ?? null,
        price_target: recRow.target_price_1 ?? null,
        created_at: recRow.created_at ?? null,
        portfolio_id: recRow.portfolio_id ?? ownedPortfolio?.id ?? null,
      }
    : null;

  return NextResponse.json({
    owned: !!ownedRow,
    shares: ownedRow?.shares ?? null,
    portfolio_id: ownedPortfolio?.id ?? rec?.portfolio_id ?? null,
    portfolio_name: ownedPortfolio?.name ?? null,
    rec,
  });
}
