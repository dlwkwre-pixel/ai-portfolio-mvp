import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/recommendations?portfolioId=X&tab=open&sort=priority&page=1&limit=25
// Returns paginated recommendation items + per-tab counts for the whole portfolio.

const PAGE_LIMIT = 25;

const TAB_STATUSES: Record<string, string[] | null> = {
  open:      ["proposed", "watchlist"],
  proposed:  ["proposed"],
  watchlist: ["watchlist"],
  executed:  ["executed", "acknowledged"],
  rejected:  ["rejected"],
  archived:  ["archived"],
  all:       null,
};

function computeTabCounts(statuses: (string | null)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tab of Object.keys(TAB_STATUSES)) {
    const filter = TAB_STATUSES[tab];
    if (filter === null) {
      counts[tab] = statuses.length;
    } else {
      counts[tab] = statuses.filter(s => filter.includes(s ?? "proposed")).length;
    }
  }
  return counts;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const portfolioId = searchParams.get("portfolioId") ?? "";
  const tab         = searchParams.get("tab") ?? "open";
  const sort        = searchParams.get("sort") ?? "priority";
  const page        = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit       = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? String(PAGE_LIMIT))));

  if (!portfolioId) {
    return NextResponse.json({ error: "portfolioId required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify the portfolio belongs to this user
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

  // Lightweight all-statuses query for tab counts
  const { data: allRows } = await supabase
    .from("recommendation_items")
    .select("recommendation_status")
    .eq("portfolio_id", portfolioId);

  const tabCounts = computeTabCounts((allRows ?? []).map(r => r.recommendation_status));

  // Paginated items query
  const statusFilter = TAB_STATUSES[tab] ?? null;

  let query = supabase
    .from("recommendation_items")
    .select("*", { count: "exact" })
    .eq("portfolio_id", portfolioId);

  if (statusFilter !== null) {
    query = query.in("recommendation_status", statusFilter);
  }

  if (sort === "priority")        query = query.order("priority_rank",    { ascending: true,  nullsFirst: false });
  else if (sort === "confidence") query = query.order("confidence_score", { ascending: false, nullsFirst: false });
  else if (sort === "oldest")     query = query.order("created_at",       { ascending: true });
  else                            query = query.order("created_at",       { ascending: false });

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data: items, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { items: items ?? [], total: count ?? 0, page, limit, tabCounts },
    { headers: { "Cache-Control": "no-store" } }
  );
}
