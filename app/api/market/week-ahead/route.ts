import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFinnhubQuote, getFinnhubEconomicCalendar, getFinnhubEarningsWeek, getFinnhubMarketNews } from "@/lib/market-data/finnhub";
import crypto from "crypto";

// Re-fetch market data every 2 hours. Gemini only fires when hash changes.
export const revalidate = 7200;

type WeekAheadResult = {
  volatility: string;
  lean: string;
  headline: string;
  key_events: string[];
  summary: string;
  generated_at: string;
  data_fetched_at: string;
};

function getWeekBounds(): { weekStart: string; from: string; to: string } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat

  // On Sat/Sun, look at NEXT week. Mon-Fri = current week.
  const daysUntilMonday = day === 0 ? 1 : day === 6 ? 2 : -(day - 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const fmt = (d: Date) => d.toISOString().split("T")[0];
  return { weekStart: fmt(monday), from: fmt(monday), to: fmt(friday) };
}

async function callGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
      }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

export async function GET() {
  try {
    const { weekStart, from, to } = getWeekBounds();

    // Fetch market context in parallel — all free Finnhub calls
    const [spy, qqq, iwm, vixy, economic, earnings, news] = await Promise.all([
      getFinnhubQuote("SPY"),
      getFinnhubQuote("QQQ"),
      getFinnhubQuote("IWM"),
      getFinnhubQuote("VIXY"),
      getFinnhubEconomicCalendar(from, to),
      getFinnhubEarningsWeek(from, to),
      getFinnhubMarketNews("general", 8),
    ]);

    const inputData = {
      weekStart,
      spy: { c: spy?.c, dp: spy?.dp },
      qqq: { c: qqq?.c, dp: qqq?.dp },
      iwm: { c: iwm?.c, dp: iwm?.dp },
      vixy: { c: vixy?.c },
      topEarnings: earnings.slice(0, 10).map((e) => `${e.symbol} (${e.date})`),
      economicEvents: economic.filter((e) => e.impact === "high").map((e) => e.event),
      newsHeadlines: news.slice(0, 5).map((n) => n.headline),
    };

    const hash = crypto.createHash("sha256").update(JSON.stringify(inputData)).digest("hex").slice(0, 16);

    // Use admin client — this is server-only market data, no user context needed
    const supabase = createAdminClient();
    const { data: cached } = await supabase
      .from("market_week_ahead")
      .select("*")
      .eq("week_start", weekStart)
      .maybeSingle();

    if (cached?.data_hash === hash) {
      // Data unchanged — update data_fetched_at timestamp and return cached result
      void supabase
        .from("market_week_ahead")
        .update({ data_fetched_at: new Date().toISOString() })
        .eq("week_start", weekStart);

      return NextResponse.json({
        volatility: cached.volatility,
        lean: cached.lean,
        headline: cached.headline,
        key_events: cached.key_events,
        summary: cached.summary,
        generated_at: cached.generated_at,
        data_fetched_at: new Date().toISOString(),
      } satisfies WeekAheadResult);
    }

    // Data changed (or no cache) — call Gemini Flash
    const vixLevel = vixy?.c ?? 0;
    const prompt = `You are a market analyst providing a brief week-ahead outlook for US equity investors.

Market context (as of ${new Date().toDateString()}):
- SPY: $${spy?.c?.toFixed(2) ?? "N/A"} (${(spy?.dp ?? 0) >= 0 ? "+" : ""}${spy?.dp?.toFixed(2) ?? "0"}% today)
- QQQ: $${qqq?.c?.toFixed(2) ?? "N/A"} (${(qqq?.dp ?? 0) >= 0 ? "+" : ""}${qqq?.dp?.toFixed(2) ?? "0"}% today)
- IWM: $${iwm?.c?.toFixed(2) ?? "N/A"} (${(iwm?.dp ?? 0) >= 0 ? "+" : ""}${iwm?.dp?.toFixed(2) ?? "0"}% today)
- VIXY (VIX proxy): $${vixLevel.toFixed(2)}

Key economic events this week: ${inputData.economicEvents.length > 0 ? inputData.economicEvents.join(", ") : "None scheduled"}

Notable earnings this week: ${inputData.topEarnings.slice(0, 8).join(", ") || "None"}

Recent headlines: ${news.slice(0, 4).map((n) => `"${n.headline}"`).join("; ")}

Analyze this data and return ONLY valid JSON (no markdown, no code fences):
{
  "volatility": "<Low|Medium|High|Extreme>",
  "lean": "<Bullish|Cautious|Bearish>",
  "headline": "<one punchy sentence summarizing the week's setup, 10-15 words>",
  "key_events": ["<event 1>", "<event 2>", "<event 3>"],
  "summary": "<2-3 sentences: what investors should watch this week, be specific about the economic events and earnings>"
}

Rules: volatility = Low if VIXY<15, Medium if 15-22, High if 22-30, Extreme if >30. key_events = 3 specific things to watch (earnings names, economic reports, macro themes). Be direct, not generic.`;

    const raw = await callGemini(prompt);
    if (!raw) {
      return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Invalid AI response" }, { status: 502 });
    }

    let result: { volatility: string; lean: string; headline: string; key_events: string[]; summary: string };
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }

    const now = new Date().toISOString();

    void supabase.from("market_week_ahead").upsert(
      {
        week_start: weekStart,
        data_hash: hash,
        volatility: result.volatility,
        lean: result.lean,
        headline: result.headline,
        key_events: result.key_events,
        summary: result.summary,
        generated_at: now,
        data_fetched_at: now,
      },
      { onConflict: "week_start" }
    );

    return NextResponse.json({
      volatility: result.volatility,
      lean: result.lean,
      headline: result.headline,
      key_events: result.key_events,
      summary: result.summary,
      generated_at: now,
      data_fetched_at: now,
    } satisfies WeekAheadResult);
  } catch (err) {
    console.error("[week-ahead]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
