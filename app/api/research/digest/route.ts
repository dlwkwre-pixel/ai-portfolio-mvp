import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { getFinnhubNews } from "@/lib/market-data/finnhub";
import { callGemini } from "@/lib/ai/gemini";

type RawEarning = { quarter: string; actual: number | null; estimate: number | null; beat: boolean | null };

export type RawMetrics = {
  netMarginTTM?: number | null;
  revenueGrowth3Y?: number | null;
  epsGrowth3Y?: number | null;
  roeTTM?: number | null;
  peBasicExclExtraTTM?: number | null;
  currentRatioAnnual?: number | null;
  debtToEquityAnnual?: number | null;
  revenuePerShareTTM?: number | null;
};

export type RawRecommendation = {
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
};

export type CompanyProfile = {
  finnhubIndustry?: string;
  country?: string;
  ipo?: string;
  name?: string;
};

type DigestResult = {
  company_overview: string;
  news_digest: string;
  earnings_snapshot: string | null;
  financial_snapshot: string | null;
  market_outlook: string;
  generated_at: string;
  raw_earnings: RawEarning[];
  raw_metrics: RawMetrics | null;
  raw_recommendation: RawRecommendation | null;
  profile: CompanyProfile | null;
};

const cache = new Map<string, { data: DigestResult; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

async function fetchEarnings(ticker: string): Promise<{ text: string; raw: RawEarning[] }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { text: "", raw: [] };
  try {
    const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${ticker}&limit=4&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return { text: "", raw: [] };
    const data = await res.json() as Array<{
      quarter?: number; year?: number;
      actual?: number | null; estimate?: number | null;
    }>;
    if (!Array.isArray(data) || data.length === 0) return { text: "", raw: [] };

    const raw: RawEarning[] = data.slice(0, 4).map((e) => {
      const quarter = `Q${e.quarter ?? "?"}  '${String(e.year ?? "").slice(-2)}`;
      const actual = typeof e.actual === "number" ? e.actual : null;
      const estimate = typeof e.estimate === "number" ? e.estimate : null;
      const beat = actual != null && estimate != null ? actual >= estimate : null;
      return { quarter, actual, estimate, beat };
    });

    const text = raw.map((r) => {
      if (r.actual == null || r.estimate == null) return `${r.quarter}: no data`;
      const diff = r.actual - r.estimate;
      return `${r.quarter}: $${r.actual.toFixed(2)} vs $${r.estimate.toFixed(2)} est — ${diff >= 0 ? "BEAT" : "MISS"}`;
    }).join("; ");

    return { text, raw };
  } catch {
    return { text: "", raw: [] };
  }
}

async function fetchFinnhubMetrics(ticker: string): Promise<{ text: string; raw: RawMetrics | null }> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return { text: "", raw: null };
  try {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) { console.error(`[finnhub-metric] ${ticker} HTTP ${res.status}`); return { text: "", raw: null }; }
    const data = await res.json() as { metric?: RawMetrics };
    const m = data.metric;
    if (!m) return { text: "", raw: null };

    // netMarginTTM is a decimal (0.241); growth/ROE are already percentages (1.81, 146.69)
    const parts: string[] = [];
    if (m.netMarginTTM != null)    parts.push(`Net Margin: ${(m.netMarginTTM * 100).toFixed(1)}%`);
    if (m.revenueGrowth3Y != null) parts.push(`Rev Growth (3Y CAGR): ${m.revenueGrowth3Y.toFixed(1)}%`);
    if (m.epsGrowth3Y != null)     parts.push(`EPS Growth (3Y CAGR): ${m.epsGrowth3Y.toFixed(1)}%`);
    if (m.roeTTM != null)          parts.push(`ROE: ${m.roeTTM.toFixed(1)}%`);

    return { text: parts.join(", "), raw: m };
  } catch (err) {
    console.error(`[finnhub-metric] ${ticker}`, err instanceof Error ? err.message : err);
    return { text: "", raw: null };
  }
}

async function fetchAnalystRecommendation(ticker: string): Promise<RawRecommendation | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json() as RawRecommendation[];
    if (!Array.isArray(data) || data.length === 0) return null;
    return data[0];
  } catch {
    return null;
  }
}

async function fetchCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  try {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json() as CompanyProfile;
    if (!data?.finnhubIndustry && !data?.country) return null;
    return { finnhubIndustry: data.finnhubIndustry, country: data.country, ipo: data.ipo, name: data.name };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { limited, retryAfter } = checkRateLimit(`research-digest:${getIp(req)}`, 5, 5 * 60_000);
  if (limited) {
    return NextResponse.json(
      { error: "Too many requests. Wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const body = await req.json() as {
    ticker?: string; company_name?: string; price?: number; change_pct?: number;
  };

  if (!body.ticker) return NextResponse.json({ error: "Ticker required." }, { status: 400 });
  const ticker = String(body.ticker).trim().toUpperCase();

  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  const [news, earningsResult, metricsResult, recommendation, profile] = await Promise.all([
    getFinnhubNews(ticker, 3),
    fetchEarnings(ticker),
    fetchFinnhubMetrics(ticker),
    fetchAnalystRecommendation(ticker),
    fetchCompanyProfile(ticker),
  ]);

  const newsLines = news.length > 0
    ? news.map((n) => `- ${n.headline} (${n.source})`).join("\n")
    : "No recent news.";

  const companyName = body.company_name ?? ticker;
  const price = body.price;
  const changePct = body.change_pct;
  const priceStr = price != null
    ? `$${price.toFixed(2)}${changePct != null ? ` (${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}% today)` : ""}`
    : "price unknown";

  const prompt = `You are a financial analyst writing a concise stock digest for retail investors. Respond ONLY with valid JSON — no markdown, no fences, no explanation.

Company: ${companyName} (${ticker}) — ${priceStr}

Recent news (last 3 days):
${newsLines}
${earningsResult.text ? `\nEarnings history (last 4 quarters): ${earningsResult.text}` : ""}
${metricsResult.text ? `\nKey financial metrics (TTM): ${metricsResult.text}` : ""}

Return this exact JSON:
{
  "company_overview": "2-3 sentences: what ${ticker} does, key products/services, competitive position or scale",
  "news_digest": "2-3 sentences synthesizing the news headlines above. If no meaningful news, say 'No major developments in the past few days.'",
  "earnings_snapshot": "1-2 sentences on recent earnings performance — specific beats/misses and trend. Return null if no earnings data provided.",
  "financial_snapshot": "Profitability, growth, and financial health in 1-2 sentences based on the metrics provided. Return null if no financial data provided.",
  "market_outlook": "One sentence on the key catalyst or risk to watch near-term"
}`;

  try {
    // Free AI chain: Gemini keys → Groq (no Grok tokens spent).
    const raw = ((await callGemini(prompt, { temperature: 0.3, maxOutputTokens: 650 })) ?? "").trim();
    if (!raw) return NextResponse.json({ error: "AI not configured." }, { status: 503 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "AI returned an unexpected response." }, { status: 502 });

    let parsed: Omit<DigestResult, "generated_at" | "raw_earnings" | "raw_metrics" | "raw_recommendation" | "profile">;
    try {
      parsed = JSON.parse(match[0]) as typeof parsed;
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response." }, { status: 502 });
    }

    const result: DigestResult = {
      ...parsed,
      generated_at: new Date().toISOString(),
      raw_earnings: earningsResult.raw,
      raw_metrics: metricsResult.raw,
      raw_recommendation: recommendation,
      profile,
    };
    cache.set(ticker, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Digest failed.";
    console.error("[research-digest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
