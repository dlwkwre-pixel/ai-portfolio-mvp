import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
        generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
      }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Week bounds: Monday through Sunday
  const now = new Date();
  const day = now.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);

  const weekStart = monday.toISOString().split("T")[0];

  // Check cache
  const { data: cached } = await supabase
    .from("portfolio_weekly_recaps")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();

  if (cached?.narrative) {
    return NextResponse.json({
      narrative: cached.narrative,
      week_return_pct: cached.week_return_pct,
      best_ticker: cached.best_ticker,
      worst_ticker: cached.worst_ticker,
      week_start: weekStart,
    });
  }

  // Fetch user portfolios
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(5);

  if (!portfolios?.length) {
    return NextResponse.json({ error: "No portfolios" }, { status: 404 });
  }

  const portfolioIds = portfolios.map((p) => p.id);

  // Fetch snapshots for this week across all portfolios
  const [{ data: weekSnapshots }, { data: thisWeekTxns }, { data: holdings }] = await Promise.all([
    supabase
      .from("portfolio_snapshots")
      .select("portfolio_id, snapshot_date, total_value")
      .in("portfolio_id", portfolioIds)
      .gte("snapshot_date", monday.toISOString())
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("transactions")
      .select("ticker, transaction_type, shares, price_per_share, total_value, transacted_at")
      .in("portfolio_id", portfolioIds)
      .gte("transacted_at", monday.toISOString())
      .order("transacted_at", { ascending: false })
      .limit(20),
    supabase
      .from("holdings")
      .select("ticker, shares, current_price, total_value, day_change_pct")
      .in("portfolio_id", portfolioIds)
      .gt("shares", 0)
      .order("total_value", { ascending: false })
      .limit(10),
  ]);

  // Compute week return
  let weekReturnPct: number | null = null;
  if (weekSnapshots && weekSnapshots.length >= 2) {
    const first = weekSnapshots[0].total_value;
    const last = weekSnapshots[weekSnapshots.length - 1].total_value;
    if (first > 0) weekReturnPct = ((last - first) / first) * 100;
  }

  // Find best/worst by day_change_pct
  const sorted = [...(holdings ?? [])].filter((h) => h.day_change_pct != null);
  sorted.sort((a, b) => (b.day_change_pct ?? 0) - (a.day_change_pct ?? 0));
  const bestTicker = sorted[0]?.ticker ?? null;
  const worstTicker = sorted[sorted.length - 1]?.ticker ?? null;

  const totalValue = (holdings ?? []).reduce((s, h) => s + (h.total_value ?? 0), 0);
  const txnSummary = (thisWeekTxns ?? [])
    .slice(0, 5)
    .map((t) => `${t.transaction_type} ${t.shares} ${t.ticker} @ $${t.price_per_share}`)
    .join("; ");

  const holdingsSummary = (holdings ?? [])
    .slice(0, 5)
    .map((h) => `${h.ticker} (${(h.day_change_pct ?? 0) >= 0 ? "+" : ""}${(h.day_change_pct ?? 0).toFixed(1)}% today)`)
    .join(", ");

  const prompt = `You are a friendly but insightful portfolio coach. Write a 2-3 sentence week-in-review summary for this investor.

Portfolio data for week of ${weekStart}:
- Estimated week return: ${weekReturnPct != null ? `${weekReturnPct >= 0 ? "+" : ""}${weekReturnPct.toFixed(2)}%` : "unavailable"}
- Total portfolio value: $${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
- Top holdings: ${holdingsSummary || "unavailable"}
- Transactions this week: ${txnSummary || "none"}
- Best performer: ${bestTicker ?? "N/A"}
- Worst performer: ${worstTicker ?? "N/A"}

Write a concise, direct recap. Acknowledge specific wins or losses. End with one practical thought for next week. Do not use em dashes. Return plain text only, no JSON or markdown.`;

  const narrative = await callGemini(prompt);
  if (!narrative) {
    return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
  }

  const result = {
    narrative: narrative.trim(),
    week_return_pct: weekReturnPct,
    best_ticker: bestTicker,
    worst_ticker: worstTicker,
    week_start: weekStart,
  };

  // Cache it
  void supabase.from("portfolio_weekly_recaps").upsert(
    {
      user_id: user.id,
      week_start: weekStart,
      narrative: result.narrative,
      week_return_pct: weekReturnPct,
      best_ticker: bestTicker,
      worst_ticker: worstTicker,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" }
  );

  return NextResponse.json(result);
}
