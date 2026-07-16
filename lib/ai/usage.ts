import { createAdminClient } from "@/lib/supabase/admin";

// AI call metering → ai_usage table (service-role only). Powers the cost-per-active-user
// number on /admin/metrics. Costs are ESTIMATES from public price sheets — the point is
// relative visibility (which feature burns what), not accounting-grade precision.
//
// Price model (USD):
//  - grok:   token cost + live-search sources at $25 / 1k sources — the search fee is
//            the real driver (~10¢/run observed on recommendation runs)
//  - gemini: free tier ($0) — logged for quota visibility
//  - groq:   free tier ($0) — logged for quota visibility
const GROK_IN_PER_1M = 0.2;
const GROK_OUT_PER_1M = 0.5;
const GROK_PER_SEARCH = 0.025;

export type AiUsageEvent = {
  provider: "grok" | "gemini" | "groq";
  model?: string | null;
  /** Feature tag, e.g. "recommendations", "grok-analysis", "strategy-chat" */
  route: string;
  userId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  /** Grok live-search source count when known */
  searchCount?: number | null;
};

function estimateCost(e: AiUsageEvent): number {
  if (e.provider !== "grok") return 0;
  const inCost = ((e.promptTokens ?? 0) / 1_000_000) * GROK_IN_PER_1M;
  const outCost = ((e.completionTokens ?? 0) / 1_000_000) * GROK_OUT_PER_1M;
  const searchCost = (e.searchCount ?? 0) * GROK_PER_SEARCH;
  return Math.round((inCost + outCost + searchCost) * 100_000) / 100_000;
}

/** Rough token estimate for callers that only know text lengths. */
export function tokensFromChars(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * Record one AI call. Await it (serverless may kill unawaited work), but it never
 * throws — metering must not break a feature, including when the table doesn't
 * exist yet or the service key is missing.
 */
export async function logAiUsage(e: AiUsageEvent): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("ai_usage").insert({
      user_id: e.userId ?? null,
      provider: e.provider,
      model: e.model ?? null,
      route: e.route,
      prompt_tokens: e.promptTokens ?? null,
      completion_tokens: e.completionTokens ?? null,
      search_count: e.searchCount ?? null,
      est_cost_usd: estimateCost(e),
    });
  } catch {
    // non-fatal by design
  }
}
