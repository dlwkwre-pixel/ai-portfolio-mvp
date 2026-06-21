import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: portfolioId } = await params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("date"); // YYYY-MM-DD
  if (!since) return NextResponse.json({ error: "date required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get snapshots from the since date onwards + deposits/withdrawals in the window.
  const [{ data: snapshots }, { data: flows }] = await Promise.all([
    supabase
      .from("portfolio_snapshots")
      .select("snapshot_date, total_value")
      .eq("portfolio_id", portfolioId)
      .gte("snapshot_date", since + "T00:00:00")
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("cash_ledger")
      .select("direction, amount, effective_at")
      .eq("portfolio_id", portfolioId)
      .gte("effective_at", since + "T00:00:00"),
  ]);

  if (!snapshots || snapshots.length < 2) {
    return NextResponse.json({ returnPct: null, reason: "not_enough_data" });
  }

  const startValue = Number(snapshots[0].total_value);
  const endValue = Number(snapshots[snapshots.length - 1].total_value);
  const startDate = snapshots[0].snapshot_date.slice(0, 10);
  const endDate = snapshots[snapshots.length - 1].snapshot_date.slice(0, 10);

  if (startValue <= 0) return NextResponse.json({ returnPct: null, reason: "invalid_start" });

  // Cash-flow-adjusted (Modified Dietz) — deposits/withdrawals aren't performance.
  const startMs = new Date(snapshots[0].snapshot_date).getTime();
  const endMs = new Date(snapshots[snapshots.length - 1].snapshot_date).getTime();
  const span = Math.max(1, endMs - startMs);
  let netFlows = 0, weightedFlows = 0;
  for (const f of flows ?? []) {
    const t = new Date(f.effective_at as string).getTime();
    if (!Number.isFinite(t) || t <= startMs || t > endMs) continue;
    const amt = Number(f.amount ?? 0);
    const signed = (String(f.direction ?? "").toUpperCase() === "OUT") ? -amt : amt;
    netFlows += signed;
    weightedFlows += signed * ((endMs - t) / span);
  }
  const denom = startValue + weightedFlows;
  const returnPct = denom > 0 ? ((endValue - startValue - netFlows) / denom) * 100 : 0;

  return NextResponse.json({
    returnPct: Math.round(returnPct * 100) / 100,
    startDate,
    endDate,
    startValue,
    endValue,
  });
}
