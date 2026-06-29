export type FinnhubQuote = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
};

export type FinnhubCandlesResponse = {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  s: string;
  t: number[];
  v: number[];
};

export type FinnhubNewsItem = {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number;
  image: string;
};

export type FinnhubRecommendation = {
  buy: number;
  hold: number;
  sell: number;
  strongBuy: number;
  strongSell: number;
  period: string;
  symbol: string;
};

export type FinnhubEarnings = {
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  hour: string;
  quarter: number;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  year: number;
};

export type FinnhubPriceTarget = {
  lastUpdated: string;
  symbol: string;
  targetHigh: number;
  targetLow: number;
  targetMean: number;
  targetMedian: number;
};

export type InsiderTransaction = {
  name: string;
  transactionDate: string;
  transactionCode: string; // P=purchase, S=sale, A=award, F=tax, M=exercise, G=gift
  share: number;
  change: number;
  transactionPrice: number;
  filingDate: string;
  isDerivative: boolean;
};

export type InsiderSummary = {
  transactions: InsiderTransaction[];
  netBuys: number;
  netSells: number;
  signal: "buy" | "sell" | "neutral";
};

// Finnhub requires exchange-prefixed symbols for crypto (e.g. BINANCE:BTCUSDT).
// Entering "BTC" plain hits a different stock ticker and returns pennies.
const CRYPTO_FINNHUB_MAP: Record<string, string> = {
  BTC:      "BINANCE:BTCUSDT",
  BITCOIN:  "BINANCE:BTCUSDT",
  ETH:      "BINANCE:ETHUSDT",
  ETHEREUM: "BINANCE:ETHUSDT",
  SOL:      "BINANCE:SOLUSDT",
  BNB:      "BINANCE:BNBUSDT",
  XRP:      "BINANCE:XRPUSDT",
  ADA:      "BINANCE:ADAUSDT",
  DOGE:     "BINANCE:DOGEUSDT",
  AVAX:     "BINANCE:AVAXUSDT",
  DOT:      "BINANCE:DOTUSDT",
  MATIC:    "BINANCE:MATICUSDT",
  POL:      "BINANCE:POLUSDT",
  LINK:     "BINANCE:LINKUSDT",
  LTC:      "BINANCE:LTCUSDT",
  UNI:      "BINANCE:UNIUSDT",
  ATOM:     "BINANCE:ATOMUSDT",
  SHIB:     "BINANCE:SHIBUSDT",
  TRX:      "BINANCE:TRXUSDT",
  TON:      "BINANCE:TONUSDT",
  ARB:      "BINANCE:ARBUSDT",
  OP:       "BINANCE:OPUSDT",
  NEAR:     "BINANCE:NEARUSDT",
  FTM:      "BINANCE:FTMUSDT",
  PEPE:     "BINANCE:PEPEUSDT",
  WIF:      "BINANCE:WIFUSDT",
  SUI:      "BINANCE:SUIUSDT",
  APT:      "BINANCE:APTUSDT",
  INJ:      "BINANCE:INJUSDT",
  FET:      "BINANCE:FETUSDT",
  RENDER:   "BINANCE:RENDERUSDT",
  SEI:      "BINANCE:SEIUSDT",
};

function cryptoFinnhubSymbol(ticker: string): string | null {
  return CRYPTO_FINNHUB_MAP[ticker.toUpperCase()] ?? null;
}

export function isCryptoTicker(ticker: string): boolean {
  return ticker.toUpperCase() in CRYPTO_FINNHUB_MAP;
}

function getApiKey(): string {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("Missing FINNHUB_API_KEY in environment variables.");
  return apiKey;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Fetch with retry on 429 — exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * Math.pow(2, attempt - 1));
    }

    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        await sleep(2000 * attempt + 1000);
        lastError = new Error(`Rate limited (429)`);
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(`Failed after ${maxRetries} retries`);
}

export async function getFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  // Remap crypto tickers to exchange-prefixed format so Finnhub returns real prices
  const finnhubSymbol = cryptoFinnhubSymbol(normalizedSymbol) ?? normalizedSymbol;

  const url = new URL("https://finnhub.io/api/v1/quote");
  url.searchParams.set("symbol", finnhubSymbol);
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Partial<FinnhubQuote>;
    if (!data) return null;

    const currentPrice =
      typeof data.c === "number" && data.c > 0 ? Number(data.c)
      : typeof data.pc === "number" && data.pc > 0 ? Number(data.pc)
      : null;

    if (currentPrice === null) return null;

    return {
      c: currentPrice,
      d: typeof data.d === "number" ? Number(data.d) : 0,
      dp: typeof data.dp === "number" ? Number(data.dp) : 0,
      h: typeof data.h === "number" ? Number(data.h) : 0,
      l: typeof data.l === "number" ? Number(data.l) : 0,
      o: typeof data.o === "number" ? Number(data.o) : 0,
      pc: typeof data.pc === "number" ? Number(data.pc) : currentPrice,
      t: typeof data.t === "number" ? Number(data.t) : 0,
    };
  } catch {
    return null;
  }
}

export async function getFinnhubDailyCandles(args: {
  symbol: string;
  fromUnix: number;
  toUnix: number;
  bustCache?: boolean;
}): Promise<FinnhubCandlesResponse | null> {
  const apiKey = getApiKey();
  const symbol = args.symbol.trim().toUpperCase();
  if (!symbol) return null;

  // Crypto needs a different endpoint and exchange-prefixed symbol
  const mappedSymbol = cryptoFinnhubSymbol(symbol) ?? symbol;
  const endpoint = isCryptoTicker(symbol)
    ? "https://finnhub.io/api/v1/crypto/candle"
    : "https://finnhub.io/api/v1/stock/candle";

  const url = new URL(endpoint);
  url.searchParams.set("symbol", mappedSymbol);
  url.searchParams.set("resolution", "D");
  url.searchParams.set("from", String(args.fromUnix));
  url.searchParams.set("to", String(args.toUnix));
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      ...(args.bustCache ? { cache: "no-store" } : { next: { revalidate: 3600 } }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as Partial<FinnhubCandlesResponse>;
    if (!data || data.s !== "ok" || !Array.isArray(data.c) || !Array.isArray(data.t)) return null;

    return {
      c: data.c.map(Number),
      h: Array.isArray(data.h) ? data.h.map(Number) : [],
      l: Array.isArray(data.l) ? data.l.map(Number) : [],
      o: Array.isArray(data.o) ? data.o.map(Number) : [],
      s: data.s,
      t: data.t.map(Number),
      v: Array.isArray(data.v) ? data.v.map(Number) : [],
    };
  } catch {
    return null;
  }
}

export async function getFinnhubNews(symbol: string, days = 7): Promise<FinnhubNewsItem[]> {
  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return [];

  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const url = new URL("https://finnhub.io/api/v1/company-news");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("from", formatDate(from));
  url.searchParams.set("to", formatDate(to));
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 1800 },
    });
    if (!response.ok) return [];

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    return data.slice(0, 5).map((item: any) => ({
      id: item.id ?? 0,
      headline: item.headline ?? "",
      summary: item.summary ?? "",
      source: item.source ?? "",
      url: item.url ?? "",
      datetime: item.datetime ?? 0,
      image: item.image ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getFinnhubRecommendations(symbol: string): Promise<FinnhubRecommendation | null> {
  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const url = new URL("https://finnhub.io/api/v1/stock/recommendation");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const latest = data[0];
    return {
      buy: latest.buy ?? 0,
      hold: latest.hold ?? 0,
      sell: latest.sell ?? 0,
      strongBuy: latest.strongBuy ?? 0,
      strongSell: latest.strongSell ?? 0,
      period: latest.period ?? "",
      symbol: latest.symbol ?? normalizedSymbol,
    };
  } catch {
    return null;
  }
}

export async function getFinnhubPriceTarget(symbol: string): Promise<FinnhubPriceTarget | null> {
  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const url = new URL("https://finnhub.io/api/v1/stock/price-target");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || typeof data.targetMean !== "number") return null;

    return {
      lastUpdated: data.lastUpdated ?? "",
      symbol: data.symbol ?? normalizedSymbol,
      targetHigh: data.targetHigh ?? 0,
      targetLow: data.targetLow ?? 0,
      targetMean: data.targetMean ?? 0,
      targetMedian: data.targetMedian ?? 0,
    };
  } catch {
    return null;
  }
}

export async function getFinnhubEarningsCalendar(tickers: string[], daysAhead = 30): Promise<FinnhubEarnings[]> {
  const apiKey = getApiKey();
  if (!tickers.length) return [];

  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + daysAhead);
  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
  url.searchParams.set("from", formatDate(from));
  url.searchParams.set("to", formatDate(to));
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 3600 },
    });
    if (!response.ok) return [];

    const data = await response.json();
    const earningsData = data?.earningsCalendar;
    if (!Array.isArray(earningsData)) return [];

    const normalizedTickers = new Set(tickers.map((t) => t.trim().toUpperCase()));
    return earningsData
      .filter((item: any) => normalizedTickers.has(item.symbol?.toUpperCase()))
      .map((item: any) => ({
        date: item.date ?? "",
        epsActual: item.epsActual ?? null,
        epsEstimate: item.epsEstimate ?? null,
        hour: item.hour ?? "",
        quarter: item.quarter ?? 0,
        revenueActual: item.revenueActual ?? null,
        revenueEstimate: item.revenueEstimate ?? null,
        symbol: item.symbol ?? "",
        year: item.year ?? 0,
      }));
  } catch {
    return [];
  }
}

// Batched market context with proper rate limiting
// Free tier: 60 calls/min
// Strategy: batches of 3 tickers (9 calls), 2s between batches, max 10 tickers
// This keeps us well under the limit and prevents timeouts
export async function getTickerMarketContext(tickers: string[]): Promise<
  Record<string, {
    news: FinnhubNewsItem[];
    recommendation: FinnhubRecommendation | null;
    priceTarget: FinnhubPriceTarget | null;
  }>
> {
  const results: Record<string, {
    news: FinnhubNewsItem[];
    recommendation: FinnhubRecommendation | null;
    priceTarget: FinnhubPriceTarget | null;
  }> = {};

  // Cap at 10 tickers — Grok does live search anyway so this is just context
  const limitedTickers = tickers.slice(0, 10);
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 2000;

  for (let i = 0; i < limitedTickers.length; i += BATCH_SIZE) {
    const batch = limitedTickers.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (ticker) => {
        try {
          const [news, recommendation, priceTarget] = await Promise.all([
            getFinnhubNews(ticker, 7),
            getFinnhubRecommendations(ticker),
            getFinnhubPriceTarget(ticker),
          ]);
          results[ticker] = { news, recommendation, priceTarget };
        } catch {
          results[ticker] = { news: [], recommendation: null, priceTarget: null };
        }
      })
    );

    if (i + BATCH_SIZE < limitedTickers.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

export async function getFinnhubMarketNews(category = "general", limit = 50): Promise<FinnhubNewsItem[]> {
  const apiKey = getApiKey();
  const url = new URL("https://finnhub.io/api/v1/news");
  url.searchParams.set("category", category);
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 900 },
    });
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.slice(0, limit).map((item: any) => ({
      id: item.id ?? 0,
      headline: item.headline ?? "",
      summary: item.summary ?? "",
      source: item.source ?? "",
      url: item.url ?? "",
      datetime: item.datetime ?? 0,
      image: item.image ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getFinnhubProfile(symbol: string): Promise<{ name: string; logo: string; weburl: string; marketCap: number | null; industry: string | null } | null> {
  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const url = new URL("https://finnhub.io/api/v1/stock/profile2");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 86400 },
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || !data.name) return null;

    return {
      name: data.name,
      logo: data.logo ?? "",
      weburl: data.weburl ?? "",
      marketCap: typeof data.marketCapitalization === "number" ? data.marketCapitalization : null,
      industry: data.finnhubIndustry ?? null,
    };
  } catch {
    return null;
  }
}

export async function getFinnhubMetrics(symbol: string): Promise<{ peRatio: number | null; weekHigh52: number | null; weekLow52: number | null } | null> {
  if (isCryptoTicker(symbol)) return null;

  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const url = new URL("https://finnhub.io/api/v1/stock/metric");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("metric", "all");
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;

    const data = await response.json();
    const m = data?.metric ?? {};
    return {
      peRatio: typeof m.peTTM === "number" ? m.peTTM : null,
      weekHigh52: typeof m["52WeekHigh"] === "number" ? m["52WeekHigh"] : null,
      weekLow52: typeof m["52WeekLow"] === "number" ? m["52WeekLow"] : null,
    };
  } catch {
    return null;
  }
}

export type FinnhubFactorMetrics = {
  peRatio: number | null;
  pbRatio: number | null;
  marketCap: number | null; // USD millions (Finnhub native unit)
  revenueGrowth: number | null; // YoY %
  epsGrowth: number | null; // YoY %
  dividendYield: number | null; // %
  beta: number | null;
  priceReturn52w: number | null; // % (momentum proxy)
};

// Richer fundamentals for factor/style analysis. Pulls from the same free
// /stock/metric?metric=all payload as getFinnhubMetrics, with sensible fallbacks
// since field coverage varies by ticker. Returns null fields rather than guessing.
export async function getFinnhubFactorMetrics(symbol: string): Promise<FinnhubFactorMetrics | null> {
  if (isCryptoTicker(symbol)) return null;

  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const url = new URL("https://finnhub.io/api/v1/stock/metric");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("metric", "all");
  url.searchParams.set("token", apiKey);

  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const firstNum = (m: Record<string, unknown>, keys: string[]): number | null => {
    for (const k of keys) { const v = num(m[k]); if (v !== null) return v; }
    return null;
  };

  try {
    const response = await fetchWithRetry(url.toString(), { method: "GET", next: { revalidate: 3600 } });
    if (!response.ok) return null;
    const data = await response.json();
    const m = (data?.metric ?? {}) as Record<string, unknown>;
    return {
      peRatio: firstNum(m, ["peTTM", "peAnnual", "peBasicExclExtraTTM"]),
      pbRatio: firstNum(m, ["pbAnnual", "pbQuarterly", "pb"]),
      marketCap: firstNum(m, ["marketCapitalization"]),
      revenueGrowth: firstNum(m, ["revenueGrowthTTMYoy", "revenueGrowthQuarterlyYoy", "revenueGrowth5Y", "revenueGrowth3Y"]),
      epsGrowth: firstNum(m, ["epsGrowthTTMYoy", "epsGrowth5Y", "epsGrowth3Y"]),
      dividendYield: firstNum(m, ["currentDividendYieldTTM", "dividendYieldIndicatedAnnual"]),
      beta: firstNum(m, ["beta"]),
      priceReturn52w: firstNum(m, ["52WeekPriceReturnDaily", "52WeekPriceReturn"]),
    };
  } catch {
    return null;
  }
}

export type FinnhubEconomicEvent = {
  time: string;
  event: string;
  country: string;
  actual: string | null;
  previous: string | null;
  estimate: string | null;
  unit: string;
  impact: string;
};

export type FinnhubEarningsItem = {
  date: string;
  symbol: string;
  name: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  hour: string;
};

export async function getFinnhubEconomicCalendar(from: string, to: string): Promise<FinnhubEconomicEvent[]> {
  const apiKey = getApiKey();
  const url = new URL("https://finnhub.io/api/v1/calendar/economic");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("token", apiKey);
  try {
    const response = await fetchWithRetry(url.toString(), { method: "GET", next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const data = await response.json();
    const events = data?.economicCalendar;
    if (!Array.isArray(events)) return [];
    return events
      .filter((e: any) => e.country === "US")
      .slice(0, 20)
      .map((e: any) => ({
        time: e.time ?? "",
        event: e.event ?? "",
        country: e.country ?? "US",
        actual: e.actual ?? null,
        previous: e.previous ?? null,
        estimate: e.estimate ?? null,
        unit: e.unit ?? "",
        impact: e.impact ?? "",
      }));
  } catch {
    return [];
  }
}

export async function getFinnhubEarningsWeek(from: string, to: string): Promise<FinnhubEarningsItem[]> {
  const apiKey = getApiKey();
  const url = new URL("https://finnhub.io/api/v1/calendar/earnings");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("token", apiKey);
  try {
    const response = await fetchWithRetry(url.toString(), { method: "GET", next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const data = await response.json();
    const cal = data?.earningsCalendar;
    if (!Array.isArray(cal)) return [];
    return cal.slice(0, 30).map((e: any) => ({
      date: e.date ?? "",
      symbol: e.symbol ?? "",
      name: e.name ?? e.symbol ?? "",
      epsEstimate: e.epsEstimate ?? null,
      revenueEstimate: e.revenueEstimate ?? null,
      hour: e.hour ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getFinnhubInsiderTransactions(symbol: string): Promise<InsiderSummary | null> {
  if (isCryptoTicker(symbol)) return null; // Crypto has no insider filings

  const apiKey = getApiKey();
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const to = new Date().toISOString().split("T")[0];

  const url = new URL("https://finnhub.io/api/v1/stock/insider-transactions");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("token", apiKey);

  try {
    const response = await fetchWithRetry(url.toString(), {
      method: "GET",
      next: { revalidate: 3600 }, // 1-hour cache
    });
    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.data || !Array.isArray(data.data)) return null;

    // Only open-market buys (P) and sells (S), exclude derivatives
    const transactions: InsiderTransaction[] = (data.data as Record<string, unknown>[])
      .filter((t) => (t.transactionCode === "P" || t.transactionCode === "S") && t.isDerivative === false)
      .slice(0, 15)
      .map((t) => ({
        name: String(t.name ?? ""),
        transactionDate: String(t.transactionDate ?? ""),
        transactionCode: String(t.transactionCode ?? ""),
        share: Number(t.share ?? 0),
        change: Number(t.change ?? 0),
        transactionPrice: Number(t.transactionPrice ?? 0),
        filingDate: String(t.filingDate ?? ""),
        isDerivative: Boolean(t.isDerivative),
      }));

    const netBuys = transactions.filter((t) => t.transactionCode === "P").length;
    const netSells = transactions.filter((t) => t.transactionCode === "S").length;
    const signal: InsiderSummary["signal"] =
      netBuys > netSells ? "buy" : netSells > netBuys ? "sell" : "neutral";

    return { transactions, netBuys, netSells, signal };
  } catch {
    return null;
  }
}
