import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGemini, extractJsonObject } from "@/lib/ai/gemini";
import { getFinnhubNews, getFinnhubQuote, getFinnhubRecommendations, getFinnhubPriceTarget } from "@/lib/market-data/finnhub";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Scan = {
  signal: "watch_closely" | "no_change" | "improving" | "deteriorating";
  headline: string;
  points: string[];
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticker } = await params;
  const symbol = ticker.trim().toUpperCase();
  if (!symbol || symbol.length > 12) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  // Optional context: the user's note/thesis on this watch item.
  const { data: item } = await supabase
    .from("watchlist").select("note, target_price, alert_direction").eq("user_id", user.id).eq("ticker", symbol).maybeSingle()
    .then((r) => r, () => ({ data: null }));

  const [news, quote, recs, target] = await Promise.all([
    getFinnhubNews(symbol, 10).catch(() => []),
    getFinnhubQuote(symbol).catch(() => null),
    getFinnhubRecommendations(symbol).catch(() => null),
    getFinnhubPriceTarget(symbol).catch(() => null),
  ]);

  const headlines = (news ?? []).slice(0, 12).map((n) => `- ${n.headline}`).join("\n");
  if (!headlines) {
    return NextResponse.json({
      ticker: symbol,
      scan: { signal: "no_change", headline: "No recent news to scan.", points: ["No notable headlines in the last 10 days. Nothing to react to right now."] },
    });
  }

  const ctx: string[] = [];
  if (quote?.c) ctx.push(`Price: $${quote.c.toFixed(2)}${quote.dp != null ? ` (${quote.dp.toFixed(1)}% today)` : ""}`);
  if (target?.targetMean != null) ctx.push(`Analyst mean target: $${target.targetMean}`);
  if (recs) ctx.push(`Analyst ratings — buy: ${recs.buy + recs.strongBuy}, hold: ${recs.hold}, sell: ${recs.sell + recs.strongSell}`);
  if (item?.note) ctx.push(`The investor is watching it because: "${item.note}"`);
  if (item?.target_price) ctx.push(`Their price target: $${item.target_price} (alert ${item.alert_direction})`);

  const prompt = `You monitor a stock on an investor's watchlist. Read the recent headlines and judge whether anything MATERIAL to the investment case has changed — not day-to-day noise. Be concise and specific.

${symbol}${ctx.length ? `\n${ctx.join("\n")}` : ""}

Recent headlines (last 10 days):
${headlines}

Respond ONLY with strict JSON:
{
  "signal": "improving" | "deteriorating" | "watch_closely" | "no_change",
  "headline": "one sentence on whether the thesis-relevant picture changed",
  "points": ["2-4 short, specific bullets on what (if anything) actually matters here"]
}
"no_change" = only noise/routine coverage. "watch_closely" = something developing worth attention. JSON only, no markdown.`;

  const raw = await callGemini(prompt, { groqFirst: true, maxOutputTokens: 700 });
  const parsed = extractJsonObject<Scan>(raw);
  if (!parsed || !Array.isArray(parsed.points)) {
    return NextResponse.json({ error: "Couldn't scan right now. Try again in a moment." }, { status: 502 });
  }

  const validSignals = ["improving", "deteriorating", "watch_closely", "no_change"];
  return NextResponse.json({
    ticker: symbol,
    newsCount: (news ?? []).length,
    scan: {
      signal: validSignals.includes(parsed.signal) ? parsed.signal : "no_change",
      headline: String(parsed.headline ?? "").slice(0, 240),
      points: (parsed.points ?? []).slice(0, 4).map((p) => String(p).slice(0, 220)),
    },
  });
}
