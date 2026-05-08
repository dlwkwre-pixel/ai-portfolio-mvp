import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are a friendly financial advisor helping an investor build a personalized investing strategy.

Your job is to ask 5-7 conversational questions to understand their investing style, then generate a complete strategy.

Questions to cover (ask naturally, one at a time):
1. Main investing goal (growth, income, capital preservation, speculation)
2. Risk tolerance (how would they react to a 20% portfolio drop)
3. Trading frequency preference (buy and hold vs active trading)
4. Sector preferences or exclusions
5. Position concentration comfort (all-in on few stocks vs diversified)
6. Time horizon (when do they need this money)
7. Any specific investing philosophy they follow (value, momentum, quality, etc.)

After you have enough information (usually 5-7 exchanges), say exactly "READY_TO_GENERATE" on its own line, followed by a JSON object like this:
{
  "name": "strategy name",
  "style": "one of: Growth/Value/Blend/Dividend / Income/Quality/Index / Passive/Sector / Thematic/Momentum/Swing/Defensive/Balanced/Speculative/Custom",
  "risk_level": "one of: Conservative/Moderate/Aggressive",
  "turnover_preference": "one of: Low/Moderate/High",
  "holding_period_bias": "one of: Short-term/Swing/Medium-term/Long-term/Very Long-term/Flexible",
  "max_position_pct": number or null,
  "min_position_pct": number or null,
  "cash_min_pct": number or null,
  "cash_max_pct": number or null,
  "description": "2-3 sentence description of the strategy",
  "prompt_text": "detailed AI prompt for analyzing portfolios using this strategy (3-5 sentences covering what to prioritize, what to avoid, sizing rules, and decision criteria)"
}

Keep responses conversational and concise (2-4 sentences). Don't ask multiple questions at once. Be encouraging and professional.`;

// --- Per-user rate limiting (best-effort, per serverless instance) ---
type RateEntry = { count: number; windowStart: number; lastAt: number };
const rateMap = new Map<string, RateEntry>();
const WINDOW_MS = 10 * 60 * 1000; // 10-minute window
const MAX_PER_WINDOW = 20;
const MIN_INTERVAL_MS = 2000; // 2 s between requests

function checkRateLimit(userId: string): string | null {
  const now = Date.now();
  const entry = rateMap.get(userId);

  // Periodic cleanup: drop entries older than 2 windows
  if (rateMap.size > 500) {
    for (const [k, v] of rateMap) {
      if (now - v.windowStart > WINDOW_MS * 2) rateMap.delete(k);
    }
  }

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    rateMap.set(userId, { count: 1, windowStart: now, lastAt: now });
    return null;
  }

  if (now - entry.lastAt < MIN_INTERVAL_MS) {
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

// --- Provider resolution ---
type ProviderConfig = { provider: string; client: OpenAI; model: string };

function getEnabledProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  if (process.env.ENABLE_GROQ_STRATEGY_BUILDER === "true" && process.env.GROQ_API_KEY) {
    providers.push({
      provider: "groq",
      client: new OpenAI({
        apiKey: process.env.GROQ_API_KEY,
        baseURL: "https://api.groq.com/openai/v1",
        timeout: 30000,
      }),
      model: process.env.GROQ_STRATEGY_BUILDER_MODEL || "llama-3.1-8b-instant",
    });
  }

  if (process.env.ENABLE_GEMINI_STRATEGY_BUILDER === "true" && process.env.GEMINI_API_KEY) {
    providers.push({
      provider: "gemini",
      client: new OpenAI({
        apiKey: process.env.GEMINI_API_KEY,
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        timeout: 30000,
      }),
      model: process.env.GEMINI_STRATEGY_BUILDER_MODEL || "gemini-1.5-flash",
    });
  }

  // xAI/Grok is opt-in only — never used unless ENABLE_XAI_STRATEGY_BUILDER=true
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

export async function POST(req: NextRequest) {
  try {
    // Auth — required for rate limiting and security
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Rate limit
    const rateLimitMsg = checkRateLimit(user.id);
    if (rateLimitMsg) {
      return NextResponse.json({ error: rateLimitMsg }, { status: 429 });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    // Cap history to prevent token abuse
    const MAX_HISTORY = 30;
    const history = (messages as { role: string; content: string }[])
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 2000) }));

    const providers = getEnabledProviders();
    if (providers.length === 0) {
      return NextResponse.json({
        error: "No AI provider is configured for the strategy builder. Set ENABLE_GROQ_STRATEGY_BUILDER=true and GROQ_API_KEY in your environment variables.",
      }, { status: 503 });
    }

    // Try each provider in order, falling back on error
    for (const config of providers) {
      try {
        const completion = await config.client.chat.completions.create({
          model: config.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...history,
          ],
          max_tokens: 1000,
          temperature: 0.7,
        });

        const text = completion.choices[0]?.message?.content ?? "";
        console.log(`[strategy-builder] provider=${config.provider} model=${config.model} user=${user.id.slice(0, 8)}`);
        return NextResponse.json({ text });
      } catch (err) {
        console.error(`[strategy-builder] provider=${config.provider} failed:`, err instanceof Error ? err.message : err);
        // Continue to next provider
      }
    }

    // All providers failed
    return NextResponse.json({
      error: "The AI strategy builder is temporarily unavailable. Please try again in a few minutes.",
    }, { status: 503 });
  } catch (error) {
    console.error("[strategy-builder] unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
