import { NextResponse } from "next/server";
import { getFinnhubQuote, getFinnhubRecommendations } from "@/lib/market-data/finnhub";

const CURATED_SECTIONS = [
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
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET() {
  const allTickers = CURATED_SECTIONS.flatMap((s) => s.tickers);
  const quotes: Record<string, { price: number; change: number; changePct: number } | null> = {};
  const analystRecs: Record<string, { buy: number; hold: number; sell: number } | null> = {};

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
        analystRecs[ticker] = rec
          ? {
              buy: (rec.strongBuy ?? 0) + (rec.buy ?? 0),
              hold: rec.hold ?? 0,
              sell: (rec.strongSell ?? 0) + (rec.sell ?? 0),
            }
          : null;
      })
    );
    if (i + BATCH_SIZE < allTickers.length) await sleep(1000);
  }

  // Build enriched ticker data for all curated tickers
  const enriched = allTickers.map(({ ticker, name }) => ({
    ticker,
    name,
    ...(quotes[ticker] ?? {}),
    analystRec: analystRecs[ticker] ?? null,
  }));

  // Daily Top Movers: top 5 by absolute % change across all curated tickers
  const withQuote = enriched.filter((t) => t.price !== undefined && (t as { changePct?: number }).changePct !== undefined);
  const dailyMovers = [...withQuote]
    .sort((a, b) => Math.abs((b as { changePct?: number }).changePct ?? 0) - Math.abs((a as { changePct?: number }).changePct ?? 0))
    .slice(0, 5);

  // Build curated sections sorted by changePct desc within each
  const curatedSections = CURATED_SECTIONS.map((section) => ({
    ...section,
    tickers: section.tickers
      .map(({ ticker, name }) => ({
        ticker,
        name,
        ...(quotes[ticker] ?? {}),
        analystRec: analystRecs[ticker] ?? null,
      }))
      .sort((a, b) => ((b as { changePct?: number }).changePct ?? 0) - ((a as { changePct?: number }).changePct ?? 0)),
  }));

  const sections = [
    curatedSections.find((s) => s.id === "trending")!,
    { id: "daily_movers", label: "Daily Top Movers", emoji: "📊", tickers: dailyMovers },
    ...curatedSections.filter((s) => s.id !== "trending"),
  ].filter(Boolean);

  return NextResponse.json(
    { sections },
    { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } }
  );
}
