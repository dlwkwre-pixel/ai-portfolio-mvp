import { createClient } from "@supabase/supabase-js";
import type { ChartResult } from "./chart-service";

// Separate admin client using service role key — no auth session needed for cache R/W.
// Falls back gracefully if env vars are missing (table not yet created, etc.)
function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getChartCacheDb(key: string): Promise<ChartResult | null> {
  const db = getAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("chart_cache")
      .select("result, expires_at")
      .eq("cache_key", key)
      .single();
    if (error || !data) return null;
    if (new Date(data.expires_at as string) <= new Date()) return null;
    return data.result as ChartResult;
  } catch {
    return null;
  }
}

export async function setChartCacheDb(
  key: string,
  result: ChartResult,
  ttlMs: number
): Promise<void> {
  const db = getAdmin();
  if (!db) return;
  try {
    await db.from("chart_cache").upsert(
      {
        cache_key: key,
        result,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" }
    );
  } catch {
    // Non-fatal — in-memory cache still works
  }
}
