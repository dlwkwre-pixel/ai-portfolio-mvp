import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MIN_EVENTS_THRESHOLD = 100;

const SIGNAL_LABELS: Record<string, string> = {
  ticker_search: "Most searched",
  stock_card_click: "Most viewed",
  stock_detail_view: "High interest",
  ai_analysis_requested: "AI analysis spike",
  watchlist_add: "Added to watchlists",
  buy_button_click: "Trending buy interest",
};

function windowToMs(w: string): number {
  return { "1h": 3_600_000, "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 }[w] ?? 86_400_000;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const window = searchParams.get("window") ?? "24h";

  try {
    const supabase = await createClient();
    const since = new Date(Date.now() - windowToMs(window)).toISOString();

    const { data, error } = await supabase
      .from("research_events")
      .select("ticker, event_type")
      .gte("created_at", since);

    if (error || !data || data.length < MIN_EVENTS_THRESHOLD) {
      return NextResponse.json(
        { trending: [], has_data: false },
        { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } }
      );
    }

    // Aggregate by ticker
    const tickerMap = new Map<string, Map<string, number>>();
    for (const row of data) {
      if (!tickerMap.has(row.ticker)) tickerMap.set(row.ticker, new Map());
      const em = tickerMap.get(row.ticker)!;
      em.set(row.event_type, (em.get(row.event_type) ?? 0) + 1);
    }

    const trending = Array.from(tickerMap.entries())
      .map(([ticker, eventMap]) => {
        const event_count = Array.from(eventMap.values()).reduce((a, b) => a + b, 0);
        const [topEvent] = Array.from(eventMap.entries()).sort((a, b) => b[1] - a[1]);
        return {
          ticker,
          company_name: null,
          event_count,
          top_signal: SIGNAL_LABELS[topEvent[0]] ?? "Gaining attention",
          time_window: window,
        };
      })
      .sort((a, b) => b.event_count - a.event_count)
      .slice(0, 8);

    return NextResponse.json(
      { trending, has_data: true },
      { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } }
    );
  } catch {
    return NextResponse.json(
      { trending: [], has_data: false },
      { headers: { "Cache-Control": "s-maxage=30" } }
    );
  }
}
