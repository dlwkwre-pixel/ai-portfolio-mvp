import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_EVENTS = new Set([
  "ticker_search",
  "stock_card_click",
  "stock_detail_view",
  "ai_analysis_requested",
  "watchlist_add",
  "buy_button_click",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, event_type } = body;

    if (!ticker || !event_type || !VALID_EVENTS.has(event_type)) {
      return NextResponse.json({ ok: false });
    }

    const normalizedTicker = String(ticker).trim().toUpperCase().slice(0, 10);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("research_events").insert({
      ticker: normalizedTicker,
      event_type,
      user_id: user?.id ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Silently fail — table may not exist yet or any other transient error
    return NextResponse.json({ ok: false });
  }
}
