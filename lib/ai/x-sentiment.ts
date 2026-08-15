import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractJsonObject } from "@/lib/ai/gemini";
import { logAiUsage } from "@/lib/ai/usage";

// A deliberately narrow sibling to lib/ai/grok-deep-dive.ts: X/Twitter search
// only (no general web_search, no bull/bear verdict synthesis) — for an
// agent that already does its own general research (e.g. Claude's native
// web search) and only needs the one signal it can't get anywhere else:
// real, current X sentiment. Cheaper per call than the full deep-dive (fewer
// searches, a much shorter output schema) and, unlike the deep-dive, meant
// to be one ingredient an agent combines itself — not a packaged opinion.

export const X_SENTIMENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // shorter than the deep-dive's 12h — sentiment moves faster than fundamentals

const SYSTEM_PROMPT = `You have live X (Twitter) search. Search X for CURRENT chatter about the given ticker/company — do not rely on training data.

Respond with ONLY valid JSON — no markdown, no code fences, no text outside the JSON object:
{
  "sentiment": "<bullish, bearish, mixed, or quiet>",
  "summary": "<2-3 sentences on what's actually being said right now>",
  "notable_mentions": "<any notable accounts, analysts, or posts driving the conversation, or 'none found'>",
  "red_flags": "<signs of hype, pump-and-dump, coordinated posting, or unverified claims — or 'none apparent'>"
}`;

export type XSentimentOk = { kind: "ok"; payload: Record<string, unknown> & { cached_at: string } };
export type XSentimentErr = { kind: "error"; error: string; status: number };

export async function runXSentimentCheck(
  ticker: string,
  companyName: string | undefined,
  userId: string | null = null
): Promise<XSentimentOk | XSentimentErr> {
  const t = ticker.trim().toUpperCase();
  const cacheKey = `xsent:${t}`;
  const admin = createAdminClient();

  const { data: cached } = await admin
    .from("stock_ai_analyses")
    .select("analysis_text, created_at")
    .eq("ticker", cacheKey)
    .gte("created_at", new Date(Date.now() - X_SENTIMENT_CACHE_TTL_MS).toISOString())
    .maybeSingle();
  if (cached?.analysis_text) {
    try {
      return { kind: "ok", payload: { ...(JSON.parse(cached.analysis_text) as Record<string, unknown>), cached_at: cached.created_at } };
    } catch { /* regenerate */ }
  }

  const apiKey = process.env.XAI_API_KEY ?? process.env.GROK_API_KEY;
  if (!apiKey) return { kind: "error", error: "Grok not configured.", status: 503 };

  const client = new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1", timeout: 120000 });
  const userPrompt = `Search X for current sentiment on ${t}${companyName ? ` (${companyName})` : ""}. Return the JSON object exactly as specified.`;

  let response: { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number }; output?: unknown[] };
  try {
    response = await client.responses.create({
      model: "grok-4-fast",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      tools: [{ type: "x_search" }],
    } as never) as typeof response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "X sentiment check failed.";
    return { kind: "error", error: msg, status: 500 };
  }

  const raw = response.output_text?.trim();

  await logAiUsage({
    provider: "grok",
    model: "grok-4-fast",
    route: "x-sentiment",
    userId,
    promptTokens: response.usage?.input_tokens ?? null,
    completionTokens: response.usage?.output_tokens ?? null,
    searchCount: Array.isArray(response.output)
      ? response.output.filter((o) => /search/.test(String((o as { type?: string })?.type ?? ""))).length
      : 1,
  });

  if (!raw) return { kind: "error", error: "Grok returned an empty response.", status: 502 };

  const analysis = extractJsonObject<Record<string, unknown>>(raw);
  if (!analysis) return { kind: "error", error: "Grok returned an unexpected response. Try again.", status: 502 };

  const now = new Date().toISOString();
  await admin.from("stock_ai_analyses").upsert(
    { ticker: cacheKey, analysis_text: JSON.stringify(analysis), created_at: now },
    { onConflict: "ticker" }
  );

  return { kind: "ok", payload: { ...analysis, cached_at: now } };
}
