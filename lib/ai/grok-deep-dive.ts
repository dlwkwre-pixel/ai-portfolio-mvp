import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractJsonObject } from "@/lib/ai/gemini";
import { logAiUsage } from "@/lib/ai/usage";

// Shared core of the paid, live-search Grok deep-dive — used by both
// app/api/research/grok-analysis/route.ts (the Research page's on-demand
// button) and the MCP run_deep_analysis tool. Pulled out so the MCP path
// doesn't have to fake a Supabase browser session just to reach this logic —
// it's a plain function, callable from any server context.

export const GROK_DEEP_DIVE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

const SYSTEM_PROMPT = `You are a sharp institutional equity analyst with live web and X (Twitter) search. Research the given stock using CURRENT information — recent news, earnings, price action, analyst moves, and real-time sentiment. Do NOT rely on stale training data for prices or events; search for them.

Respond with ONLY valid JSON — no markdown, no code fences, no text outside the JSON object:
{
  "verdict": "<BUY or HOLD or SELL>",
  "conviction": "<Low or Medium or High>",
  "price_target": "<12-month price target as a number, e.g. 215.00, or null>",
  "timeframe": "12 months",
  "bull_case": "<2-3 specific bullish arguments citing current fundamentals/catalysts>",
  "bear_case": "<2-3 specific bearish arguments citing current risks/headwinds>",
  "key_catalysts": "<near-term events/trends that could move the stock, with dates if known>",
  "key_risks": "<main downside risks, be specific>",
  "takeaway": "<one-sentence directional view stated plainly>"
}`;

// A plain `A | B` union where A is a Record<string, unknown> doesn't narrow
// cleanly with an `"error" in result` check (the index signature means TS
// can't rule out A also having an `error` key) — tagged with `kind` instead
// so callers get real discrimination.
export type GrokDeepDiveOk = { kind: "ok"; payload: Record<string, unknown> & { cached_at: string } };
export type GrokDeepDiveErr = { kind: "error"; error: string; status: number };
export type GrokDeepDiveResult = GrokDeepDiveOk | GrokDeepDiveErr;

export async function runGrokDeepDive(
  ticker: string,
  companyName: string | undefined,
  price: number | undefined,
  changePct: number | undefined,
  userId: string | null = null
): Promise<GrokDeepDiveResult> {
  const t = ticker.trim().toUpperCase();
  const cacheKey = `grok:${t}`;
  const admin = createAdminClient();

  const { data: cached } = await admin
    .from("stock_ai_analyses")
    .select("analysis_text, created_at")
    .eq("ticker", cacheKey)
    .gte("created_at", new Date(Date.now() - GROK_DEEP_DIVE_CACHE_TTL_MS).toISOString())
    .maybeSingle();
  if (cached?.analysis_text) {
    try {
      return { kind: "ok", payload: { ...(JSON.parse(cached.analysis_text) as Record<string, unknown>), cached_at: cached.created_at } };
    } catch { /* regenerate */ }
  }

  const apiKey = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY;
  if (!apiKey) return { kind: "error", error: "Grok not configured.", status: 503 };

  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1", timeout: 290000 });

  const userPrompt = `Analyze ${t}${companyName ? ` (${companyName})` : ""}.${price != null ? ` Last price around $${Number(price).toFixed(2)}${changePct != null ? ` (${changePct >= 0 ? "+" : ""}${Number(changePct).toFixed(2)}% today)` : ""}.` : ""}

Run 2-4 targeted live searches (recent news, latest analyst actions/price targets, and current X sentiment) before forming a view. Then return the JSON object exactly as specified.`;

  let response: { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number }; output?: unknown[] };
  try {
    response = await client.responses.create({
      model: "grok-4-fast",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [{ type: "web_search" }, { type: "x_search" }],
    } as never) as typeof response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Analysis failed.";
    return { kind: "error", error: msg, status: 500 };
  }

  const raw = response.output_text?.trim();

  await logAiUsage({
    provider: "grok",
    model: "grok-4-fast",
    route: "grok-analysis",
    userId,
    promptTokens: response.usage?.input_tokens ?? null,
    completionTokens: response.usage?.output_tokens ?? null,
    // The prompt asks for 2-4 live searches; count actual search calls when present.
    searchCount: Array.isArray(response.output)
      ? response.output.filter((o) => /search/.test(String((o as { type?: string })?.type ?? ""))).length
      : 3,
  });

  if (!raw) return { kind: "error", error: "Grok returned an empty response.", status: 502 };

  const analysis = extractJsonObject<Record<string, unknown>>(raw);
  if (!analysis) return { kind: "error", error: "Grok returned an unexpected response. Try again.", status: 502 };

  // Awaited, not fire-and-forget: this is a $ real-money cache — losing the
  // write to a serverless function freezing after the response is sent means
  // paying for a fresh Grok call again on the very next request. Confirmed
  // this actually happens with `void` here (two calls a second apart
  // returned different price targets before this was awaited).
  const now = new Date().toISOString();
  await admin.from("stock_ai_analyses").upsert(
    { ticker: cacheKey, analysis_text: JSON.stringify(analysis), created_at: now },
    { onConflict: "ticker" }
  );

  return { kind: "ok", payload: { ...analysis, cached_at: now } };
}
