import { NextResponse } from "next/server";
import { getFinnhubRecommendations } from "@/lib/market-data/finnhub";
import { getFmpMovers, getFmpScreen, getFmpQuotes } from "@/lib/market-data/fmp";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

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

export async function GET(req: Request) {
  const { limited, retryAfter } = checkRateLimit(`research-screener:${getIp(req)}`, 5, 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  // Auto-populate every section by its theme from live FMP data, falling back to the
  // curated list for any theme FMP can't serve. Each header now reflects real market data:
  //   Trending → most-active names, Momentum → top gainers, High Growth → large-cap high-beta
  //   tech, Dividend Stars → big dividend payers, Defensive Plays → low-beta large caps.
  const curatedById = new Map(CURATED_SECTIONS.map((s) => [s.id, s]));
  const [actives, gainers, losers, growthScreen, divScreen, defScreen] = await Promise.all([
    getFmpMovers("actives").catch(() => []),
    getFmpMovers("gainers").catch(() => []),
    getFmpMovers("losers").catch(() => []),
    getFmpScreen({ marketCapMoreThan: 10_000_000_000, sector: "Technology", betaMoreThan: 1.15, limit: 25 }).catch(() => []),
    getFmpScreen({ marketCapMoreThan: 20_000_000_000, dividendMoreThan: 1, limit: 40 }).catch(() => []),
    getFmpScreen({ marketCapMoreThan: 20_000_000_000, betaLowerThan: 0.85, limit: 40 }).catch(() => []),
  ]);

  // Use the top-N live names if FMP gave us enough; otherwise fall back to the curated list.
  const pick = (
    auto: { symbol: string; name: string }[],
    id: string,
    n = 5
  ): { ticker: string; name: string }[] => {
    const live = auto.slice(0, n).map((a) => ({ ticker: a.symbol, name: a.name }));
    return live.length >= 3 ? live : (curatedById.get(id)?.tickers ?? live);
  };

  const sectionDefs = [
    { id: "trending", label: "Trending", emoji: "🔥", tickers: pick(actives, "trending") },
    { id: "growth", label: "High Growth", emoji: "🚀", tickers: pick(growthScreen, "growth") },
    { id: "momentum", label: "Momentum Picks", emoji: "📈", tickers: pick(gainers, "momentum") },
    { id: "dividend", label: "Dividend Stars", emoji: "💰", tickers: pick(divScreen, "dividend") },
    { id: "defensive", label: "Defensive Plays", emoji: "🛡️", tickers: pick(defScreen, "defensive") },
  ];

  // Dedup tickers across sections for a single rate-limited Finnhub enrichment pass.
  const tickerName = new Map<string, string>();
  for (const sec of sectionDefs) for (const t of sec.tickers) if (!tickerName.has(t.ticker)) tickerName.set(t.ticker, t.name);
  const allTickers = [...tickerName.keys()];

  const quotes: Record<string, { price: number; change: number; changePct: number } | null> = {};
  const analystRecs: Record<string, { buy: number; hold: number; sell: number } | null> = {};

  // Quotes in ONE batched FMP call (was per-ticker Finnhub with 1s sleeps between batches —
  // the main source of the slow "cards take a beat" load). Seed from the mover endpoints we
  // already fetched so movers never miss a price.
  const moverSeed = new Map<string, { price: number; change: number; changePct: number }>();
  for (const m of [...actives, ...gainers, ...losers]) {
    if (!moverSeed.has(m.symbol)) moverSeed.set(m.symbol, { price: m.price, change: m.change, changePct: m.changesPercentage });
  }
  const fmpQuoteMap = await getFmpQuotes(allTickers).catch(() => new Map());
  for (const ticker of allTickers) {
    const f = fmpQuoteMap.get(ticker);
    quotes[ticker] = f
      ? { price: f.price, change: f.change, changePct: f.changesPercentage }
      : moverSeed.get(ticker) ?? null;
  }

  // Analyst ratings: Finnhub is per-ticker, so fetch in parallel batches with a short gap
  // (no more 1s sleeps). Best-effort — a missed rec just omits the B/H/S badge on that card.
  const REC_BATCH = 10;
  for (let i = 0; i < allTickers.length; i += REC_BATCH) {
    const batch = allTickers.slice(i, i + REC_BATCH);
    await Promise.all(
      batch.map(async (ticker) => {
        const rec = await getFinnhubRecommendations(ticker).catch(() => null);
        analystRecs[ticker] = rec
          ? {
              buy: (rec.strongBuy ?? 0) + (rec.buy ?? 0),
              hold: rec.hold ?? 0,
              sell: (rec.strongSell ?? 0) + (rec.sell ?? 0),
            }
          : null;
      })
    );
    if (i + REC_BATCH < allTickers.length) await sleep(250);
  }

  // Enrich each section's tickers with live quote + analyst rec, sorted by % change desc.
  const enrichedSections = sectionDefs.map((section) => ({
    id: section.id,
    label: section.label,
    emoji: section.emoji,
    tickers: section.tickers
      .map(({ ticker, name }) => ({
        ticker,
        name,
        ...(quotes[ticker] ?? {}),
        analystRec: analystRecs[ticker] ?? null,
      }))
      .sort((a, b) => ((b as { changePct?: number }).changePct ?? 0) - ((a as { changePct?: number }).changePct ?? 0)),
  }));

  // Daily Top Movers: the market's REAL biggest gainers + losers (FMP, free tier).
  // Falls back to the enriched universe sorted by |change| if FMP movers are unavailable.
  const realMovers = [...gainers.slice(0, 4), ...losers.slice(0, 2)]
    .map((m) => ({ ticker: m.symbol, name: m.name, price: m.price, change: m.change, changePct: m.changesPercentage, analystRec: null }))
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 6);
  const dailyMovers = realMovers.length > 0
    ? realMovers
    : (() => {
        const seen = new Set<string>();
        return enrichedSections
          .flatMap((s) => s.tickers)
          .filter((t) => (t as { changePct?: number }).changePct !== undefined && !seen.has(t.ticker) && seen.add(t.ticker))
          .sort((a, b) => Math.abs((b as { changePct?: number }).changePct ?? 0) - Math.abs((a as { changePct?: number }).changePct ?? 0))
          .slice(0, 5);
      })();

  const sections = [
    enrichedSections.find((s) => s.id === "trending")!,
    { id: "daily_movers", label: "Daily Top Movers", emoji: "📊", tickers: dailyMovers },
    ...enrichedSections.filter((s) => s.id !== "trending"),
  ].filter(Boolean);

  return NextResponse.json(
    { sections },
    // Cache the computed sections at the edge for 5 min (stale-while-revalidate 30 min) so
    // most visitors get an instant cached response and rarely hit the compute path.
    { headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=1800" } }
  );
}
