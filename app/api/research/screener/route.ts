import { NextResponse } from "next/server";
import { getFinnhubQuote, getFinnhubRecommendations } from "@/lib/market-data/finnhub";

function computeAnalystLabel(rec: Awaited<ReturnType<typeof getFinnhubRecommendations>>): "Buy" | "Hold" | "Sell" | null {
  if (!rec) return null;
  const bullish = (rec.strongBuy ?? 0) + (rec.buy ?? 0);
  const bearish = (rec.strongSell ?? 0) + (rec.sell ?? 0);
  const neutral = rec.hold ?? 0;
  const total = bullish + bearish + neutral;
  if (total === 0) return null;
  if (bullish / total >= 0.5) return "Buy";
  if (bearish / total >= 0.4) return "Sell";
  return "Hold";
}

const SCREENER_SECTIONS = [
  {
    id: "trending",
    label: "Trending",
    emoji: "🔥",
    tickers: [
      { ticker: "NVDA", name: "NVIDIA" },
      { ticker: "TSLA", name: "Tesla" },
      { ticker: "AAPL", name: "Apple" },
      { ticker: "META", name: "Meta" },
      { ticker: "AMZN", name: "Amazon" },
    ],
  },
  {
    id: "momentum",
    label: "Momentum Picks",
    emoji: "📈",
    tickers: [
      { ticker: "PLTR", name: "Palantir" },
      { ticker: "ARM", name: "Arm Holdings" },
      { ticker: "AVGO", name: "Broadcom" },
      { ticker: "AMD", name: "AMD" },
      { ticker: "SMCI", name: "Super Micro" },
    ],
  },
  {
    id: "dividend",
    label: "Dividend Stars",
    emoji: "💰",
    tickers: [
      { ticker: "JNJ", name: "Johnson & Johnson" },
      { ticker: "KO", name: "Coca-Cola" },
      { ticker: "PG", name: "Procter & Gamble" },
      { ticker: "VZ", name: "Verizon" },
      { ticker: "T", name: "AT&T" },
    ],
  },
  {
    id: "defensive",
    label: "Defensive Plays",
    emoji: "🛡️",
    tickers: [
      { ticker: "WMT", name: "Walmart" },
      { ticker: "MCD", name: "McDonald's" },
      { ticker: "UNH", name: "UnitedHealth" },
      { ticker: "PFE", name: "Pfizer" },
      { ticker: "GLD", name: "SPDR Gold ETF" },
    ],
  },
  {
    id: "growth",
    label: "High Growth",
    emoji: "🚀",
    tickers: [
      { ticker: "NFLX", name: "Netflix" },
      { ticker: "CRWD", name: "CrowdStrike" },
      { ticker: "SNOW", name: "Snowflake" },
      { ticker: "SHOP", name: "Shopify" },
      { ticker: "MSTR", name: "MicroStrategy" },
    ],
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET() {
  const allTickers = SCREENER_SECTIONS.flatMap((s) => s.tickers);
  const quotes: Record<string, { price: number; change: number; changePct: number } | null> = {};
  const analystLabels: Record<string, "Buy" | "Hold" | "Sell" | null> = {};

  const BATCH_SIZE = 5;
  for (let i = 0; i < allTickers.length; i += BATCH_SIZE) {
    const batch = allTickers.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async ({ ticker }) => {
        const [q, rec] = await Promise.all([
          getFinnhubQuote(ticker).catch(() => null),
          getFinnhubRecommendations(ticker).catch(() => null),
        ]);
        quotes[ticker] = q ? { price: q.c, change: q.d, changePct: q.dp } : null;
        analystLabels[ticker] = computeAnalystLabel(rec);
      })
    );
    if (i + BATCH_SIZE < allTickers.length) await sleep(1000);
  }

  const sections = SCREENER_SECTIONS.map((section) => ({
    ...section,
    tickers: section.tickers.map(({ ticker, name }) => ({
      ticker,
      name,
      ...(quotes[ticker] ?? {}),
      analystLabel: analystLabels[ticker] ?? null,
    })),
  }));

  return NextResponse.json(
    { sections },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } }
  );
}
