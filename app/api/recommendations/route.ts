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

  const enrichedItems = await enrichItems(supabase, portfolioId, items ?? []);

  return NextResponse.json(
    { items: enrichedItems, total: count ?? 0, page, limit, tabCounts },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Attaches two things the raw recommendation_items row can't carry on its own:
// (1) thesis_status from position_thesis, keyed by ticker — the real, continuously
//     revised signal (see applyThesisUpdates in recommendation-actions.ts), which the
//     UI prefers over its old regex-over-rationale fallback.
// (2) for AI Radar re_entry items, the ticker/action_type of the trim/sell that
//     originated them (radar_origin_recommendation_item_id is just a FK — the card
//     needs something human-readable). Both are best-effort: a DB that hasn't run
//     the relevant migration yet just gets nulls back, never a broken page.
async function enrichItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  portfolioId: string,
  items: Record<string, unknown>[]
) {
  if (items.length === 0) return items;

  const tickers = [...new Set(items.map(i => String(i.ticker ?? "").toUpperCase()).filter(Boolean))];
  const thesisByTicker = new Map<string, string>();
  if (tickers.length > 0) {
    try {
      const { data } = await supabase
        .from("position_thesis")
        .select("ticker, thesis_status")
        .eq("portfolio_id", portfolioId)
        .in("ticker", tickers);
      for (const row of data ?? []) {
        if (row.ticker && row.thesis_status) thesisByTicker.set(String(row.ticker).toUpperCase(), row.thesis_status);
      }
    } catch { /* position_thesis may not exist yet — degrade gracefully */ }
  }

  const originIds = [...new Set(
    items.map(i => i.radar_origin_recommendation_item_id).filter((id): id is string => typeof id === "string")
  )];
  const originById = new Map<string, { ticker: string | null; action_type: string | null }>();
  if (originIds.length > 0) {
    try {
      const { data } = await supabase
        .from("recommendation_items")
        .select("id, ticker, action_type")
        .in("id", originIds);
      for (const row of data ?? []) originById.set(row.id, { ticker: row.ticker, action_type: row.action_type });
    } catch { /* radar columns may not exist yet — degrade gracefully */ }
  }

  return items.map(item => {
    const ticker = String(item.ticker ?? "").toUpperCase();
    const origin = typeof item.radar_origin_recommendation_item_id === "string"
      ? originById.get(item.radar_origin_recommendation_item_id) : null;
    return {
      ...item,
      thesis_status: thesisByTicker.get(ticker) ?? null,
      radar_origin_ticker: origin?.ticker ?? null,
      radar_origin_action_type: origin?.action_type ?? null,
    };
  });
}
