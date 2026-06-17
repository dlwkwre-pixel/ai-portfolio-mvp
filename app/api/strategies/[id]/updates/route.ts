import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Only expose updates for a public strategy or one the requester owns.
  // Defense-in-depth on top of RLS so private strategy history can't leak by id.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: strat } = await supabase
    .from("strategies")
    .select("id, is_public, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!strat || (!strat.is_public && strat.user_id !== user?.id)) {
    return NextResponse.json({ updates: [] });
  }

  const { data, error } = await supabase
    .from("strategy_updates")
    .select("id, update_text, change_type, tickers_mentioned, created_at, author_id")
    .eq("strategy_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updates: data ?? [] });
}
