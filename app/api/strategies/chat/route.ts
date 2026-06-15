import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { getFredMacroSignals } from "@/lib/market-data/fred";
import { getFinnhubQuote, getFinnhubMetrics } from "@/lib/market-data/finnhub";
import { getFmpMarketBreadth } from "@/lib/market-data/fmp-breadth";
import { computeRegime, regimePromptContext } from "@/lib/market-data/regime";

// ── Phase 1: Conversation ─────────────────────────────────────────────────────
// Warm, focused interview. Ends with READY_TO_GENERATE signal (no JSON).
// Temperature 0.7 — natural and conversational.

const CHAT_SYSTEM_PROMPT = `You are Finn, BuyTune's AI strategy advisor. You help investors define a personalized investing strategy through a short, focused conversation.

## Your Goal
Conduct a 5–7 exchange interview to understand the investor's situation. Be warm, sharp, and financially literate — like a trusted advisor, not a chatbot. When you have enough information, signal that you are ready to generate their strategy.

## Topics to Cover (all required, one question at a time)

Ask these naturally in any order that flows from the conversation:

1. **Primary goal** — What is this money actually for? (retirement, financial independence, income, passive wealth, specific purchase?) And roughly when do they need it?
2. **Risk tolerance** — Ask concretely: their portfolio drops 30% in three months. Do they buy more, hold, or sell to stop the bleeding? Have they invested through a crash before?
3. **Time horizon** — When is the earliest they would need to withdraw a significant amount?
4. **Account type** — Is this money in a taxable brokerage, Roth IRA, 401k, or something else? This shapes the tax strategy.
5. **Trading activity** — Do they want to set it and forget for years, or are they comfortable reviewing and rebalancing every quarter?
6. **Concentration** — Comfortable with 8–12 high-conviction holdings, or prefer spreading across 25+ positions?
7. **Preferences and constraints** — Any sectors they love or want to avoid? ESG requirements? Stocks they already own and plan to keep?

## Conversation Rules

- ONE question per message — never stack two questions
- Keep each response to 2–4 sentences during the interview
- If an answer is vague ("moderate risk", "long-term"), ask one specific follow-up before moving on. Example: "When you say moderate — what would a genuinely bad year look like to you? Down 15%? Down 30%?"
- Do NOT number your questions or announce what topic you are on
- Do NOT rush — 3 exchanges is never enough to build a real strategy

## When Ready to Generate

After 5–7 substantive exchanges where you have clear answers to all seven topics:

1. Write 1–2 sentences summarizing what kind of strategy you are about to build, in plain language the investor will recognize themselves in
2. On a new line, write exactly: READY_TO_GENERATE

Do NOT output any JSON. Do NOT output the strategy. Only the summary sentence(s) and the READY_TO_GENERATE signal.`;

// ── Phase 2: Generation ───────────────────────────────────────────────────────
// Pure structured output. Only receives conversation as context.
// Temperature 0.1 — precise and consistent.

const GENERATION_SYSTEM_PROMPT = `You are a financial strategy architect. You have been given a conversation between an investor and Finn, an AI strategy advisor. Your job: synthesize everything the investor said into a precise, actionable investing strategy.

Output ONLY a single valid JSON object. No markdown fences, no explanation, no preamble — raw JSON only.

## Schema

{
  "name": "3–5 word strategy name that captures its personality. Examples: 'Patient Quality Compounder', 'Roth IRA Growth Engine', 'Conservative Income Shield', 'High-Conviction Value Hunter', 'Balanced Dividend Builder'",
  "style": "Exactly one of: Growth | Value | Blend | Dividend / Income | Quality | Index / Passive | Sector / Thematic | Momentum | Swing | Defensive | Balanced | Speculative | Custom",
  "risk_level": "Exactly one of: Conservative | Moderate | Aggressive",
  "turnover_preference": "Exactly one of: Low | Moderate | High",
  "holding_period_bias": "Exactly one of: Short-term | Swing | Medium-term | Long-term | Very Long-term | Flexible",
  "max_position_pct": integer 5–40 (maximum % of portfolio in one holding),
  "min_position_pct": integer 1–10 (minimum % — positions smaller than this are noise),
  "cash_min_pct": integer 0–25 (minimum cash reserve to keep at all times),
  "cash_max_pct": integer 5–40 (maximum cash before it is dragging on returns),
  "description": "2–3 sentences written for the investor to read. Should capture their personality, goals, and approach in plain language — they should recognize themselves in it immediately.",
  "prompt_text": "SEE DETAILED INSTRUCTIONS BELOW — THIS IS THE MOST IMPORTANT FIELD"
}

## prompt_text — Critical Field Instructions

This text is passed word-for-word to an AI that analyzes the investor's stock portfolio and generates buy/hold/sell recommendations. A generic prompt_text produces generic, useless recommendations. A specific one produces genuinely differentiated, high-quality analysis.

Requirements:
- 180–320 words
- Every criterion must be concrete and measurable — no vague adjectives
- Must cover all five elements below
- Must reflect specific details from the conversation (account type, sectors mentioned, risk answers, time horizon, concentration preference)

Five required elements:
1. **What to prioritize**: specific financial metrics (ROIC, FCF yield, revenue growth rate, gross margin trends, net debt / EBITDA, insider ownership)
2. **Sector tilts**: which industries to overweight or avoid, based on what the investor actually said
3. **Position sizing rules**: initial entry %, when and how to add, maximum % per holding, minimum %
4. **Sell and trim discipline**: specific numerical triggers for reducing or exiting a position — not "sell if thesis breaks" but "sell if revenue growth falls below X% for Y consecutive quarters"
5. **Account-specific considerations**: if Roth IRA → minimize turnover, favor long-duration compounders, the tax-free structure rewards patience; if taxable → avoid unnecessary short-term gains, consider tax-loss harvesting windows; if 401k → contribution-based strategy, focus on index-like core

## Quality Contrast

WEAK (never produce this):
"Focus on quality growth companies with strong fundamentals. Diversify across sectors. Avoid high-risk speculative positions. Look for companies with good management and competitive advantages. Think long-term and stay disciplined."

STRONG (produce this quality):
"Prioritize businesses with durable competitive moats: target companies with FCF yield above 4%, ROIC above 15% sustained over three or more years, and net debt below 2x EBITDA. Favor category leaders in secular growth markets — cloud infrastructure, healthcare technology, consumer staples with pricing power — where demand is structurally driven rather than cyclical. Avoid capital-intensive industrials, highly leveraged balance sheets (debt/equity above 1.5x), and companies with sustained insider selling over 12+ months. Position sizing: initiate at 4–6% with moderate conviction; add to 8–12% only after two or more quarters of confirmed thesis strength; never exceed 15% in a single name. Trim automatically if a position grows beyond 18% through appreciation. Sell triggers: revenue growth falls below 8% for two consecutive quarters without a clear recovery catalyst; management credibility is damaged by a guidance miss of more than 20%; a direct competitor achieves a durable cost or technology advantage. Since this is a Roth IRA, prioritize high-growth compounders that generate large unrealized gains — the tax-free structure rewards patience over years, not quarters. Maintain 5–12% cash at all times to act on meaningful price dislocations."`;

// ── Regime context (injected into chat system prompt) ────────────────────────

let _regimeCache: { text: string; fetchedAt: number } | null = null;
const REGIME_CACHE_MS = 4 * 60 * 60 * 1000; // 4-hour server-side cache

async function getRegimeSystemPrefix(): Promise<string> {
  const now = Date.now();
  if (_regimeCache && now - _regimeCache.fetchedAt < REGIME_CACHE_MS) {
    return _regimeCache.text;
  }
  try {
    const [macro, spyQuote, spyMetrics, xlkQuote, xluQuote, breadth] = await Promise.all([
      getFredMacroSignals(),
      getFinnhubQuote("SPY"),
      getFinnhubMetrics("SPY"),
      getFinnhubQuote("XLK"),
      getFinnhubQuote("XLU"),
      getFmpMarketBreadth(),
    ]);
    const spyDailyMove = spyQuote?.dp !== undefined ? Math.abs(spyQuote.dp) : null;
    const xlkDp = xlkQuote?.dp ?? null;
    const xluDp = xluQuote?.dp ?? null;
    const regime = computeRegime(macro, {
      spyPrice: spyQuote?.c ?? null,
      spy52wHigh: spyMetrics?.weekHigh52 ?? null,
      spy52wLow: spyMetrics?.weekLow52 ?? null,
      spyMomentum1m: null,
      qqqVsSpyRatio: null,
      techVsDefensiveRatio: xlkDp !== null && xluDp !== null ? xlkDp - xluDp : null,
      impliedVolProxy: spyDailyMove !== null ? Math.round(spyDailyMove * (252 ** 0.5) * 0.7) : null,
      marketBreadthRatio: breadth?.ratio ?? null,
    });
    const text = `[Current market context: ${regimePromptContext(regime)}]\n\n`;
    _regimeCache = { text, fetchedAt: now };
    return text;
  } catch {
    return "";
  }
}

// ── Per-user rate limiting ────────────────────────────────────────────────────

type RateEntry = { count: number; windowStart: number; lastAt: number };
const rateMap = new Map<string, RateEntry>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 25;
const MIN_INTERVAL_MS = 1500;

function checkRateLimit(userId: string, skipIntervalCheck = false): string | null {
  const now = Date.now();
  const entry = rateMap.get(userId);

  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) {
      if (now - v.windowStart > WINDOW_MS * 2) rateMap.delete(k);
    }
  }

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    rateMap.set(userId, { count: 1, windowStart: now, lastAt: now });
    return null;
  }

  if (!skipIntervalCheck && now - entry.lastAt < MIN_INTERVAL_MS) {
    return "Please wait a moment before sending another message.";
  }

  if (entry.count >= MAX_PER_WINDOW) {
    const resetMins = Math.ceil((entry.windowStart + WINDOW_MS - now) / 60000);
    return `Rate limit reached. Please try again in ${resetMins} minute(s).`;
  }

  entry.count++;
  entry.lastAt = now;
  return null;
}

// ── Provider resolution ───────────────────────────────────────────────────────

type ProviderConfig = { provider: string; client: OpenAI; model: string };

function getEnabledProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  // Groq — primary free provider
  if (process.env.ENABLE_GROQ_STRATEGY_BUILDER === "true" && process.env.GROQ_API_KEY) {
    providers.push({
      provider: "groq",
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
        timeout: 45000,
      }),
      model: process.env.GROQ_STRATEGY_BUILDER_MODEL || "llama-3.3-70b-versatile",
    });
  }

  // Groq key 2 — automatic fallback when primary Groq is rate-limited
  if (process.env.ENABLE_GROQ_STRATEGY_BUILDER === "true" && process.env.GROQ_API_KEY_2) {
    providers.push({
      provider: "groq-2",
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY_2,
        baseURL: "https://api.groq.com/openai/v1",
        timeout: 45000,
      }),
      model: process.env.GROQ_STRATEGY_BUILDER_MODEL || "llama-3.3-70b-versatile",
    });
  }

  // Gemini — optional fallback (disabled by default to preserve quota)
  if (process.env.ENABLE_GEMINI_STRATEGY_BUILDER === "true") {
    for (const key of [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean)) {
      providers.push({
        provider: "gemini",
        client: new OpenAI({
          apiKey: key as string,
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          timeout: 30000,
        }),
        model: process.env.GEMINI_STRATEGY_BUILDER_MODEL || "gemini-2.0-flash",
      });
    }
  }

  // xAI — opt-in only
  if (process.env.ENABLE_XAI_STRATEGY_BUILDER === "true" && process.env.XAI_API_KEY) {
    providers.push({
      provider: "xai",
      client: new OpenAI({
        apiKey: process.env.XAI_API_KEY,
        baseURL: "https://api.x.ai/v1",
        timeout: 60000,
      }),
      model: process.env.XAI_STRATEGY_BUILDER_MODEL || "grok-4-fast",
    });
  }

  return providers;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Parse body before rate limiting so we can apply phase-aware rules
    const body = await req.json();
    const { messages, phase = "chat" } = body;
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const isGeneration = phase === "generate";

    // Generation is a programmatic follow-up call — skip the per-message interval
    // check so it isn't blocked by the preceding chat message's lastAt timestamp.
    const rateLimitMsg = checkRateLimit(user.id, isGeneration);
    if (rateLimitMsg) {
      return NextResponse.json({ error: rateLimitMsg }, { status: 429 });
    }

    // Cap history to prevent token abuse (generation phase needs full context)
    const MAX_HISTORY = isGeneration ? 40 : 30;
    const history = (messages as { role: string; content: string }[])
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content).slice(0, isGeneration ? 3000 : 2000),
      }));

    const providers = getEnabledProviders();
    if (providers.length === 0) {
      return NextResponse.json({
        error: "No AI provider configured. Set ENABLE_GROQ_STRATEGY_BUILDER=true and GROQ_API_KEY.",
      }, { status: 503 });
    }

    // Build system prompt — inject live market regime into chat phase only
    let systemPrompt = isGeneration ? GENERATION_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT;
    if (!isGeneration) {
      const regimePrefix = await getRegimeSystemPrefix();
      if (regimePrefix) systemPrompt = regimePrefix + CHAT_SYSTEM_PROMPT;
    }

    for (const config of providers) {
      try {
        const completion = await config.client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            // For generation phase: explicit final instruction to output only JSON
            ...(isGeneration ? [{
              role: "user" as const,
              content: "Generate the strategy JSON now based on our conversation. Output only the JSON object, nothing else.",
            }] : []),
          ],
          max_tokens: isGeneration ? 1800 : 450,
          temperature: isGeneration ? 0.1 : 0.72,
        });

        const text = completion.choices[0]?.message?.content ?? "";
        console.log(`[strategy-builder] phase=${phase} provider=${config.provider} model=${config.model} user=${user.id.slice(0, 8)} tokens=${text.length}`);
        return NextResponse.json({ text });
      } catch (err) {
        console.error(`[strategy-builder] phase=${phase} provider=${config.provider} failed:`, err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({
      error: "The AI strategy builder is temporarily unavailable. Please try again in a few minutes.",
    }, { status: 503 });
  } catch (error) {
    console.error("[strategy-builder] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
