import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callGemini, extractJsonObject } from "@/lib/ai/gemini";
import { getFinnhubQuote, getFinnhubProfile, getFinnhubFactorMetrics, getFinnhubRecommendations, getFinnhubPriceTarget } from "@/lib/market-data/finnhub";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SecondOpinion = {
  headline: string;
  bearPoints: { title: string; detail: string }[];
  risks: string[];
  questions: string[];
  thesisGap: string | null;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership.
  const { data: portfolio } = await supabase
    .from("portfolios").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const ticker = String(body?.ticker ?? "").trim().toUpperCase();
  if (!ticker || ticker.length > 12) return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });

  // The user's most recent journal thesis for this ticker (the case to argue against).
  const { data: journalRows } = await supabase
    .from("decision_journal")
    .select("action, conviction, thesis, created_at")
    .eq("user_id", user.id).eq("portfolio_id", id).eq("ticker", ticker)
    .order("created_at", { ascending: false }).limit(1)
    .then((r) => r, () => ({ data: null }));
  const thesisEntry = journalRows?.[0] ?? null;

  // Market context (all free, best-effort).
  const [quote, profile, metrics, recs, target] = await Promise.all([
    getFinnhubQuote(ticker).catch(() => null),
    getFinnhubProfile(ticker).catch(() => null),
    getFinnhubFactorMetrics(ticker).catch(() => null),
    getFinnhubRecommendations(ticker).catch(() => null),
    getFinnhubPriceTarget(ticker).catch(() => null),
  ]);

  const ctx: string[] = [`Ticker: ${ticker}${profile?.name ? ` (${profile.name})` : ""}`];
  if (profile?.industry) ctx.push(`Industry: ${profile.industry}`);
  if (quote?.c) ctx.push(`Current price: $${quote.c.toFixed(2)}${quote.dp != null ? ` (${quote.dp.toFixed(1)}% today)` : ""}`);
  if (metrics?.peRatio != null) ctx.push(`P/E: ${metrics.peRatio.toFixed(1)}`);
  if (metrics?.pbRatio != null) ctx.push(`P/B: ${metrics.pbRatio.toFixed(1)}`);
  if (metrics?.revenueGrowth != null) ctx.push(`Revenue growth: ${metrics.revenueGrowth.toFixed(1)}%`);
  if (metrics?.beta != null) ctx.push(`Beta: ${metrics.beta.toFixed(2)}`);
  if (metrics?.priceReturn52w != null) ctx.push(`52-week return: ${metrics.priceReturn52w.toFixed(1)}%`);
  if (target?.targetMean != null) ctx.push(`Analyst mean target: $${target.targetMean}`);
  if (recs) ctx.push(`Latest analyst ratings — buy: ${recs.buy + recs.strongBuy}, hold: ${recs.hold}, sell: ${recs.sell + recs.strongSell}`);

  const thesisBlock = thesisEntry
    ? `The investor's own thesis (logged ${new Date(thesisEntry.created_at).toLocaleDateString()}, action "${thesisEntry.action}", ${thesisEntry.conviction ?? "?"} conviction):\n"""${thesisEntry.thesis}"""`
    : "The investor has not logged a written thesis for this position.";

  const prompt = `You are a sharp, fair devil's advocate for a retail investor. Your job is to argue the BEAR case and stress-test their thinking — not to be reflexively negative, but to surface what could go wrong and what they may be overlooking. Be specific and grounded; no generic boilerplate.

${ctx.join("\n")}

${thesisBlock}

Respond ONLY with strict JSON in this exact shape:
{
  "headline": "one punchy sentence summarizing the strongest bear argument",
  "bearPoints": [{"title": "short label", "detail": "2-3 sentences, specific to this company/valuation"}],
  "risks": ["concrete risk 1", "concrete risk 2", "concrete risk 3"],
  "questions": ["a pointed question that challenges their thesis", "another"],
  "thesisGap": ${thesisEntry ? `"the single biggest blind spot or unstated assumption in their thesis, or null if it is genuinely well-reasoned"` : "null"}
}
Give 3-4 bearPoints, 3-4 risks, 2-3 questions. Keep it honest: if the bull case is strong, say so within a point. No markdown, JSON only.`;

  const raw = await callGemini(prompt, { groqFirst: true, maxOutputTokens: 1100 });
  const parsed = extractJsonObject<SecondOpinion>(raw);

  if (!parsed || !Array.isArray(parsed.bearPoints)) {
    return NextResponse.json({ error: "Could not generate a second opinion right now. Try again in a moment." }, { status: 502 });
  }

  return NextResponse.json({
    ticker,
    hadThesis: !!thesisEntry,
    opinion: {
      headline: String(parsed.headline ?? "").slice(0, 240),
      bearPoints: (parsed.bearPoints ?? []).slice(0, 5).map((p) => ({
        title: String(p?.title ?? "").slice(0, 80),
        detail: String(p?.detail ?? "").slice(0, 500),
      })),
      risks: (parsed.risks ?? []).slice(0, 5).map((r) => String(r).slice(0, 200)),
      questions: (parsed.questions ?? []).slice(0, 4).map((q) => String(q).slice(0, 200)),
      thesisGap: parsed.thesisGap ? String(parsed.thesisGap).slice(0, 300) : null,
    },
  });
}
