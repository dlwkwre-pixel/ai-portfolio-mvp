import { createAdminClient } from "@/lib/supabase/admin";

// Small key-value store on the chart_cache table (cache_key → jsonb result). Server-only
// (service-role client). Reads return null and writes no-op on any failure, so callers
// can treat it as best-effort.

export async function kvGet<T>(key: string): Promise<T | null> {
  try {
    const { data } = await createAdminClient().from("chart_cache").select("result").eq("cache_key", key).maybeSingle();
    return (data?.result as T) ?? null;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, result: unknown, ttlMs = 365 * 86_400_000): Promise<void> {
  try {
    await createAdminClient().from("chart_cache").upsert({
      cache_key: key, result,
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  } catch {
    // non-fatal
  }
}

// A capped list of ids under one key (dismissed alerts, seen notices, ...).
export async function kvGetIds(key: string): Promise<string[]> {
  return (await kvGet<{ ids?: string[] }>(key))?.ids ?? [];
}

export async function kvAddIds(key: string, ids: string[], cap = 2000): Promise<void> {
  const prev = await kvGetIds(key);
  await kvSet(key, { ids: Array.from(new Set([...prev, ...ids])).slice(-cap) });
}
