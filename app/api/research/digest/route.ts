import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { checkRateLimit, getIp } from "@/lib/rate-limit";
import { getFinnhubNews } from "@/lib/market-data/finnhub";

type DigestResult = {
  company_overview: string;
  news_digest: string;
  earnings_snapshot: string | null;
  financial_snapshot: string | null;
  market_outlook: string;
  generated_at: string;
};

const cache = new Map<string, { data: DigestResult; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000;

async function fetchEarnings(ticker: string): Promise<string> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return "";
  try {
    const url = `https://finnhub.io/api/v1/stock/earnings?symbol=${ticker}&limit=4&token=${key}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return "";
    const data = await res.json() as Array<{
      quarter?: number; year?: number;
      actual?: number | null; estimate?: number | null;
      surprisePercent?: number | null;
    }>;
    if (!Array.isArray(data) || data.length === 0) return "";
    return data.slice(0, 4).map((e) => {
      const q = `Q${e.quarter ?? "?"}/${e.year ?? "?"}`;
      if (e.actual == null || e.estimate == null) return `${q}: no data`;
      const diff = e.actual - e.estimate;
      const pct = e.surprisePercent != null
        ? ` (${e.surprisePercent >= 0 ? "+" : ""}${e.surprisePercent.toFixed(1)}% surprise)`
        : "";
      return `${q}: $${e.actual.toFixed(2)} actual vs $${e.estimate.toFixed(2)} est${pct} — ${diff >= 0 ? "BEAT" : "MISS"}`;
    }).join("; ");
  } catch {
    return "";
  }
}

async function fetchIncomeStatement(ticker: string): Promise<string> {
  const key = process.env.FMP_API_KEY;
  if (!key) return "";
  try {
    const url = `https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=2&apikey=${key}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return "";
    const data = await res.json() as Array<{
      date?: string;
      revenue?: number;
      netIncome?: number;
      grossProfitRatio?: number;
    }>;
    if (!Array.isArray(data) || data.length === 0) return "";
    const d = data[0];
    const fmtB = (n: number) =>
      n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M` : `$${n.toFixed(0)}`;
    const parts: string[] = [];
    if (d.revenue) parts.push(`Revenue: ${fmtB(d.revenue)}`);
    if (d.netIncome != null)
      parts.push(`Net Income: ${d.netIncome >= 0 ? fmtB(d.netIncome) : `-${fmtB(Math.abs(d.netIncome))}`}`);
    if (d.grossProfitRatio)
      parts.push(`Gross Margin: ${(d.grossProfitRatio * 100).toFixed(1)}%`);
    if (parts.length === 0) return "";
    return parts.join(", ") + (d.date ? ` (${d.date.slice(0, 4)})` : "");
  } catch {
    return "";
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

  const grokKey = process.env.GROK_API_KEY ?? process.env.XAI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const apiKey = grokKey ?? groqKey;
  if (!apiKey) return NextResponse.json({ error: "AI not configured." }, { status: 503 });

  const isGrok = Boolean(grokKey);
  const baseURL = isGrok ? "https://api.x.ai/v1" : "https://api.groq.com/openai/v1";
  const model = isGrok ? "grok-4.3" : "llama-3.3-70b-versatile";

  const [news, earnings, financials] = await Promise.all([
    getFinnhubNews(ticker, 3),
    fetchEarnings(ticker),
    fetchIncomeStatement(ticker),
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
${earnings ? `\nEarnings history (last 4 quarters): ${earnings}` : ""}
${financials ? `\nFinancials (most recent annual): ${financials}` : ""}

Return this exact JSON:
{
  "company_overview": "2-3 sentences: what ${ticker} does, key products/services, competitive position or scale",
  "news_digest": "2-3 sentences synthesizing the news headlines above. If no meaningful news, say 'No major developments in the past few days.'",
  "earnings_snapshot": "Specific beats/misses over recent quarters. Return null if no earnings data provided.",
  "financial_snapshot": "Revenue scale, profitability, key trend in 1-2 sentences. Return null if no financial data provided.",
  "market_outlook": "One sentence on the key catalyst or risk to watch near-term"
}`;

  try {
    const client = new OpenAI({ apiKey, baseURL });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 650,
    });

    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "AI returned an unexpected response." }, { status: 502 });

    let parsed: Omit<DigestResult, "generated_at">;
    try {
      parsed = JSON.parse(match[0]) as Omit<DigestResult, "generated_at">;
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response." }, { status: 502 });
    }

    const result: DigestResult = { ...parsed, generated_at: new Date().toISOString() };
    cache.set(ticker, { data: result, ts: Date.now() });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Digest failed.";
    console.error("[research-digest]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
