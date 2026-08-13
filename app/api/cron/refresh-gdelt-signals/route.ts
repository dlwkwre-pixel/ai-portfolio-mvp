import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGdeltArticleCount } from "@/lib/market-data/gdelt";

export const maxDuration = 120;

const GDELT_COURTESY_DELAY_MS = 5500; // GDELT's DOC API asks for ~1 request/5s

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Refreshes gdelt_signal_cache for active geopolitical-category scenarios,
// sequentially with a courtesy delay between calls. Runs on its own schedule
// (vercel.json) so a live user request to /api/scenarios/signals never has
// to wait on GDELT — that route only reads this cache.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: scenarios, error } = await admin
    .from("ai_generated_scenarios")
    .select("scenario_key, keywords")
    .eq("is_active", true)
    .eq("category", "geopolitical")
    .gt("expires_at", new Date().toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!scenarios || scenarios.length === 0) return NextResponse.json({ refreshed: 0 });

  let refreshed = 0;
  let failed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const { scenario_key, keywords } = scenarios[i];
    if (i > 0) await sleep(GDELT_COURTESY_DELAY_MS);

    const count = await getGdeltArticleCount(Array.isArray(keywords) ? keywords as string[] : []);
    if (count == null) { failed++; continue; }

    const { error: upsertErr } = await admin.from("gdelt_signal_cache")
      .upsert({ scenario_key, article_count: count, checked_at: new Date().toISOString() });
    if (upsertErr) failed++; else refreshed++;
  }

  return NextResponse.json({ refreshed, failed, total: scenarios.length });
}
