// CoinGecko crypto price service
// Uses the Demo API key tier (pro-api.coingecko.com with x-cg-demo-api-key header)
// Returns an empty Map silently when COINGECKO_API_KEY is not set

const COINGECKO_BASE = "https://pro-api.coingecko.com/api/v3";

// Hardcoded map of uppercase ticker → CoinGecko coin ID
const TICKER_TO_COINGECKO_ID: Record<string, string> = {
  BTC:    "bitcoin",
  ETH:    "ethereum",
  SOL:    "solana",
  BNB:    "binancecoin",
  XRP:    "ripple",
  ADA:    "cardano",
  DOGE:   "dogecoin",
  AVAX:   "avalanche-2",
  DOT:    "polkadot",
  MATIC:  "matic-network",
  LINK:   "chainlink",
  UNI:    "uniswap",
  ATOM:   "cosmos",
  LTC:    "litecoin",
  BCH:    "bitcoin-cash",
  SHIB:   "shiba-inu",
  TRX:    "tron",
  NEAR:   "near",
  FTM:    "fantom",
  ARB:    "arbitrum",
  OP:     "optimism",
  APT:    "aptos",
  SUI:    "sui",
  PEPE:   "pepe",
  TON:    "the-open-network",
  POL:    "polygon-ecosystem-token",
  INJ:    "injective-protocol",
  FET:    "fetch-ai",
  RENDER: "render-token",
  SEI:    "sei-network",
  WIF:    "dogwifcoin",
};

export type CryptoQuote = {
  ticker: string;
  coinGeckoId: string;
  priceUsd: number | null;
  change24hPct: number | null;
  marketCapUsd: number | null;
};

type CoinListEntry = {
  id: string;
  symbol: string;
  name: string;
};

// Module-level cache for the full coin list (used for unknown tickers)
let coinListCache: CoinListEntry[] | null = null;
let coinListFetchedAt = 0;
const COIN_LIST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type CoinGeckoPriceResponse = Record<
  string,
  {
    usd?: number;
    usd_24h_change?: number;
    usd_market_cap?: number;
  }
>;

function getApiKey(): string | null {
  return process.env.COINGECKO_API_KEY ?? null;
}

async function fetchCoinList(apiKey: string): Promise<CoinListEntry[]> {
  const now = Date.now();
  if (coinListCache && now - coinListFetchedAt < COIN_LIST_TTL_MS) {
    return coinListCache;
  }

  try {
    const url = new URL(`${COINGECKO_BASE}/coins/list`);
    const response = await fetch(url.toString(), {
      headers: { "x-cg-demo-api-key": apiKey },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return [];

    const data = (await response.json()) as CoinListEntry[];
    if (!Array.isArray(data)) return [];

    coinListCache = data;
    coinListFetchedAt = Date.now();
    return data;
  } catch {
    return [];
  }
}

async function resolveCoinGeckoIds(
  tickers: string[],
  apiKey: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unknown: string[] = [];

  for (const ticker of tickers) {
    const upper = ticker.toUpperCase();
    const known = TICKER_TO_COINGECKO_ID[upper];
    if (known) {
      result.set(upper, known);
    } else {
      unknown.push(upper);
    }
  }

  if (unknown.length > 0) {
    const coinList = await fetchCoinList(apiKey);
    for (const ticker of unknown) {
      const lower = ticker.toLowerCase();
      const match = coinList.find(
        (c) => c.symbol.toLowerCase() === lower
      );
      if (match) {
        result.set(ticker, match.id);
      }
    }
  }

  return result;
}

// Is this ticker a well-known crypto symbol? Used as a safe heuristic for tickers whose
// asset type is unknown (e.g. sold-out positions seen only in activity history) — the
// full coin-list search is NOT used here, so an equity symbol that happens to collide
// with some obscure coin can't be mispriced.
export function isKnownCryptoTicker(ticker: string): boolean {
  return !!TICKER_TO_COINGECKO_ID[ticker.trim().toUpperCase()];
}

// Daily close history (up to 365 days — the Demo tier's max) for one crypto ticker →
// Map<YYYY-MM-DD, priceUsd>. Powers linked-portfolio reconstruction for crypto holdings.
// Empty map on any failure or when COINGECKO_API_KEY is not set.
export async function getCryptoDailyCloses(ticker: string): Promise<Map<string, number>> {
  const empty = new Map<string, number>();
  const apiKey = getApiKey();
  if (!apiKey) return empty;
  try {
    const ids = await resolveCoinGeckoIds([ticker], apiKey);
    const id = ids.get(ticker.trim().toUpperCase());
    if (!id) return empty;

    const url = new URL(`${COINGECKO_BASE}/coins/${encodeURIComponent(id)}/market_chart`);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("days", "365");
    url.searchParams.set("interval", "daily");

    const response = await fetch(url.toString(), {
      headers: { "x-cg-demo-api-key": apiKey },
      next: { revalidate: 21600 },
    });
    if (!response.ok) return empty;

    const data = (await response.json()) as { prices?: [number, number][] };
    if (!Array.isArray(data?.prices)) return empty;

    const m = new Map<string, number>();
    for (const [ts, price] of data.prices) {
      if (Number.isFinite(ts) && Number.isFinite(price) && price > 0) {
        m.set(new Date(ts).toISOString().slice(0, 10), price);
      }
    }
    return m;
  } catch {
    return empty;
  }
}

export async function getCryptoPrices(
  tickers: string[]
): Promise<Map<string, CryptoQuote>> {
  const empty = new Map<string, CryptoQuote>();
  if (tickers.length === 0) return empty;

  const apiKey = getApiKey();
  if (!apiKey) return empty;

  try {
    const tickerToId = await resolveCoinGeckoIds(tickers, apiKey);
    if (tickerToId.size === 0) return empty;

    const ids = Array.from(new Set(tickerToId.values())).join(",");

    const url = new URL(`${COINGECKO_BASE}/simple/price`);
    url.searchParams.set("ids", ids);
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_change", "true");
    url.searchParams.set("include_market_cap", "true");

    const response = await fetch(url.toString(), {
      headers: { "x-cg-demo-api-key": apiKey },
      next: { revalidate: 60 },
    });

    if (!response.ok) return empty;

    const data = (await response.json()) as CoinGeckoPriceResponse;
    if (!data || typeof data !== "object") return empty;

    const result = new Map<string, CryptoQuote>();

    for (const [ticker, coinGeckoId] of tickerToId) {
      const priceData = data[coinGeckoId];
      result.set(ticker.toUpperCase(), {
        ticker: ticker.toUpperCase(),
        coinGeckoId,
        priceUsd: typeof priceData?.usd === "number" ? priceData.usd : null,
        change24hPct:
          typeof priceData?.usd_24h_change === "number"
            ? priceData.usd_24h_change
            : null,
        marketCapUsd:
          typeof priceData?.usd_market_cap === "number"
            ? priceData.usd_market_cap
            : null,
      });
    }

    return result;
  } catch {
    return empty;
  }
}
