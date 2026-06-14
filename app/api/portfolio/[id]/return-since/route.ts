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

  // Get snapshots from the since date onwards, ordered by date
  const { data: snapshots } = await supabase
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value")
    .eq("portfolio_id", portfolioId)
    .gte("snapshot_date", since + "T00:00:00")
    .order("snapshot_date", { ascending: true });

  if (!snapshots || snapshots.length < 2) {
    return NextResponse.json({ returnPct: null, reason: "not_enough_data" });
  }

  const startValue = Number(snapshots[0].total_value);
  const endValue = Number(snapshots[snapshots.length - 1].total_value);
  const startDate = snapshots[0].snapshot_date.slice(0, 10);
  const endDate = snapshots[snapshots.length - 1].snapshot_date.slice(0, 10);

  if (startValue <= 0) return NextResponse.json({ returnPct: null, reason: "invalid_start" });

  const returnPct = ((endValue - startValue) / startValue) * 100;

  return NextResponse.json({
    returnPct: Math.round(returnPct * 100) / 100,
    startDate,
    endDate,
    startValue,
    endValue,
  });
}
