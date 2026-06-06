import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAggregatedHeadlines } from "@/lib/market-data/news-aggregator";

// Existing static scenario titles — AI should not duplicate these
const EXISTING_SCENARIOS = [
  "Strait of Hormuz Reopens", "Oil Supply Shock", "Nuclear Energy Revival",
  "Fed Rate Cut Cycle Begins", "Inflation Reignites", "US Dollar Weakens Significantly",
  "China-Taiwan Military Escalation", "Russia-Ukraine Peace Deal", "US Defense Budget Surge",
  "AI Spending Acceleration Continues", "AI Capex Bubble Deflates", "Semiconductor Supply Glut",
  "Major Cybersecurity Attack Wave", "US Recession Confirmed", "Soft Landing Confirmed",
  "Consumer Spending Slowdown", "Housing Market Recovery", "Trade War Escalates",
  "Renewable Energy Policy Boost", "Big Tech Antitrust Crackdown",
  "Equity Market Correction (10%+)", "Banking Stress / Credit Crunch",
  "China Unleashes Major Stimulus", "Commodity Supercycle Resumes",
];

type GeneratedScenario = {
  scenario_key: string;
  title: string;
  thesis: string;
  emoji: string;
  category: string;
  tags: string[];
  keywords: string[];
  long_plays: { ticker: string; name: string; reason: string }[];
  avoid_plays: { ticker: string; name: string; reason: string }[];
  time_horizon: "days" | "weeks" | "months" | "years";
  trigger_context: string;
};

function expiresAt(horizon: string): string {
  const d = new Date();
  if (horizon === "days")   d.setDate(d.getDate() + 4);
  if (horizon === "weeks")  d.setDate(d.getDate() + 16);
  if (horizon === "months") d.setDate(d.getDate() + 50);
  if (horizon === "years")  d.setDate(d.getDate() + 100);
  return d.toISOString();
}

function buildPrompt(headlines: string[]): string {
  const headlineBlock = headlines.length > 0
    ? headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")
    : "No headlines available — use your knowledge of current macro conditions.";

  return `You are a senior macro investment research analyst at a top hedge fund. You write institutional-quality scenario cards read by sophisticated investors.

Recent market headlines (past 48 hours):
${headlineBlock}

Already-covered scenarios to AVOID duplicating:
${EXISTING_SCENARIOS.map((t) => `- ${t}`).join("\n")}

Task: Generate 7 distinct macro investment scenario cards.

STRICT REQUIREMENTS:
1. Time horizon mix: exactly 1-2 "days", 2 "weeks", 2 "months", 1 "years"
2. Each scenario needs 5-8 long_plays and 2-4 avoid_plays
3. CRITICAL — every stock reason must be mechanistically specific to THAT company:
   BAD: "increased demand for travel services" (generic, same for all travel stocks)
   GOOD: "Delta's fuel hedge expires Q3 — lower jet fuel prices directly expand operating margin by ~3pts"
   GOOD: "Carnival's Caribbean itineraries were canceled due to port restrictions; reopening restores 18% of capacity"
   Each reason must explain the SPECIFIC mechanism, exposure, or financial lever for that exact company.
4. Cover diverse sectors across long_plays (do NOT list 3 hotels, or 4 energy companies — mix sectors)
5. Avoid plays must explain the specific downside mechanism, not just "loses from X"
6. thesis: 2-3 sentences — cause → market mechanism → which sector types benefit and the rough magnitude/speed
7. keywords: 6-10 lowercase search terms that would appear in real headlines about this scenario
8. Tickers must be US-listed on NYSE or NASDAQ

Return ONLY a valid JSON array. No markdown fences, no commentary, just the raw JSON array:

[
  {
    "scenario_key": "unique-kebab-slug",
    "title": "5-8 word scenario title",
    "thesis": "2-3 sentence explanation of cause, mechanism, and expected market impact",
    "emoji": "one relevant emoji",
    "category": "energy|monetary|geopolitical|tech|economy|policy|markets",
    "tags": ["Tag1", "Tag2"],
    "keywords": ["lowercase keyword", "search phrase", "headline term"],
    "long_plays": [
      { "ticker": "TICK", "name": "Company Name", "reason": "company-specific mechanistic reason with financial detail" }
    ],
    "avoid_plays": [
      { "ticker": "TICK", "name": "Company Name", "reason": "specific downside mechanism for this company" }
    ],
    "time_horizon": "days|weeks|months|years",
    "trigger_context": "one sentence naming the specific news event or catalyst"
  }
]`;
}

function parseScenarios(raw: string): GeneratedScenario[] {
  // Strip markdown fences if model added them
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/```\s*$/m, "")
    .trim();

  // Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as GeneratedScenario[];
  } catch {
    // Fallback: extract first JSON array via regex
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed as GeneratedScenario[];
      } catch {
        // pass
      }
    }
  }
  return [];
}

export async function GET(request: Request) {
  // Auth: Vercel Cron sends CRON_SECRET as bearer token
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Service role key not configured." }, { status: 500 });
  }

  // Skip if generated in the past 20 hours (bypass with ?force=1)
  if (!force) {
    const { data: recent } = await adminSupabase
      .from("ai_generated_scenarios")
      .select("generated_at")
      .gte("generated_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      return NextResponse.json({ message: "Already generated recently, skipping." });
    }
  }

  // Groq is preferred (free, fast, sufficient with Finnhub context).
  // Grok (xAI) is the fallback if no Groq keys are present.
  const groqKey  = process.env.GROQ_API_KEY;
  const groq2Key = process.env.GROQ_API_KEY_2;
  const grokKey  = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;

  const GROQ_URL = "https://api.groq.com/openai/v1";
  const GROQ_MODEL = "llama-3.3-70b-versatile";

  if (!groqKey && !groq2Key && !grokKey) {
    return NextResponse.json({ error: "No AI key configured." }, { status: 500 });
  }

  // Fetch news headlines from all configured sources (Finnhub + Alpha Vantage + NewsAPI)
  const headlines = await fetchAggregatedHeadlines(40);
  const prompt = buildPrompt(headlines);

  // Build parallel calls: up to two Groq keys, or one Grok call as fallback
  type CallSpec = { client: OpenAI; model: string; temperature: number };
  const calls: CallSpec[] = [];

  if (groqKey) {
    calls.push({ client: new OpenAI({ apiKey: groqKey, baseURL: GROQ_URL }), model: GROQ_MODEL, temperature: 0.7 });
  }
  if (groq2Key) {
    calls.push({ client: new OpenAI({ apiKey: groq2Key, baseURL: GROQ_URL }), model: GROQ_MODEL, temperature: 0.8 });
  }
  if (calls.length === 0 && grokKey) {
    calls.push({ client: new OpenAI({ apiKey: grokKey, baseURL: "https://api.x.ai/v1" }), model: "grok-3-fast", temperature: 0.7 });
  }

  let allScenarios: GeneratedScenario[] = [];

  try {
    const results = await Promise.allSettled(
      calls.map(({ client, model, temperature }) =>
        client.chat.completions.create({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature,
          max_tokens: 4000,
        })
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        const raw = result.value.choices[0]?.message?.content ?? "";
        const parsed = parseScenarios(raw);
        allScenarios = [...allScenarios, ...parsed];
      }
    }
  } catch (err) {
    console.error("AI generation error:", err);
    return NextResponse.json({ error: "AI call failed." }, { status: 500 });
  }

  if (allScenarios.length === 0) {
    return NextResponse.json({ error: "AI returned no parseable scenarios." }, { status: 500 });
  }

  // Deduplicate by scenario_key across both calls
  const seen = new Set<string>();
  const unique = allScenarios.filter((s) => {
    if (!s.scenario_key || seen.has(s.scenario_key)) return false;
    seen.add(s.scenario_key);
    return true;
  });

  // Upsert to Supabase
  const now = new Date().toISOString();
  const rows = unique
    .filter((s) => s.scenario_key && s.title && s.thesis)
    .map((s) => ({
      scenario_key:    s.scenario_key,
      title:           s.title,
      thesis:          s.thesis,
      emoji:           s.emoji || "📊",
      category:        s.category || "markets",
      tags:            Array.isArray(s.tags) ? s.tags : [],
      keywords:        Array.isArray(s.keywords) ? s.keywords : [],
      long_plays:      Array.isArray(s.long_plays) ? s.long_plays : [],
      avoid_plays:     Array.isArray(s.avoid_plays) ? s.avoid_plays : [],
      time_horizon:    ["days","weeks","months","years"].includes(s.time_horizon) ? s.time_horizon : "weeks",
      trigger_context: s.trigger_context || null,
      generated_at:    now,
      expires_at:      expiresAt(s.time_horizon),
      is_active:       true,
    }));

  const { error: upsertError } = await adminSupabase
    .from("ai_generated_scenarios")
    .upsert(rows, { onConflict: "scenario_key" });

  if (upsertError) {
    console.error("Upsert error:", upsertError.message);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // Deactivate expired scenarios
  await adminSupabase
    .from("ai_generated_scenarios")
    .update({ is_active: false })
    .lt("expires_at", now);

  return NextResponse.json({ generated: rows.length, scenarios: rows.map((r) => r.title) });
}
