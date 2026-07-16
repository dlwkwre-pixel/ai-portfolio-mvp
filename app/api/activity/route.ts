import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Retention heartbeat: one row per user per day in user_activity_daily.
// The client tracker fires once per module per session, so traffic here is tiny.
const MODULES = new Set([
  "dashboard", "portfolios", "planning", "research", "strategies",
  "community", "tax", "connections", "profile", "watchlist",
]);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const { module: mod } = await req.json().catch(() => ({})) as { module?: string };
    if (!mod || !MODULES.has(mod)) return NextResponse.json({ ok: false }, { status: 400 });

    const day = new Date().toISOString().slice(0, 10);

    // Read-merge-upsert: tiny row, at most a handful of writes per user per day.
    const { data: existing } = await supabase
      .from("user_activity_daily")
      .select("modules, events")
      .eq("user_id", user.id)
      .eq("day", day)
      .maybeSingle();

    const modules: string[] = existing?.modules ?? [];
    if (!modules.includes(mod)) modules.push(mod);

    await supabase.from("user_activity_daily").upsert({
      user_id: user.id,
      day,
      modules,
      events: (existing?.events ?? 0) + 1,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Metrics must never surface errors to the app.
    return NextResponse.json({ ok: false });
  }
}
