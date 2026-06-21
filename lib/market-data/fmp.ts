const FMP_BASE = "https://financialmodelingprep.com/api/v3";

export type FmpQuote = {
  symbol: string;
  price: number;
  change: number;
  changesPercentage: number;
};

type FmpRawQuote = {
  symbol: string;
  price?: number;
  change?: number;
  changesPercentage?: number;
};

/**
 * Fetch quotes for one or more tickers from FMP.
 * FMP supports comma-separated symbols in a single request.
 * Returns a map from uppercase ticker → FmpQuote. Missing or failed tickers are absent.
 */
export async function getFmpQuotes(tickers: string[]): Promise<Map<string, FmpQuote>> {
  const key = process.env.FMP_API_KEY;
  if (!key || tickers.length === 0) return new Map();

  const symbols = tickers.map((t) => t.toUpperCase()).join(",");
  const url = `${FMP_BASE}/quote/${symbols}?apikey=${key}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return new Map();

    const data: FmpRawQuote[] = await res.json();
    if (!Array.isArray(data)) return new Map();

    const result = new Map<string, FmpQuote>();
    for (const row of data) {
      if (!row.symbol || typeof row.price !== "number" || row.price === 0) continue;
      result.set(row.symbol.toUpperCase(), {
        symbol: row.symbol.toUpperCase(),
        price: row.price,
        change: row.change ?? 0,
        changesPercentage: row.changesPercentage ?? 0,
      });
    }
    return result;
  } catch {
    return new Map();
  }
}

export type FmpMover = { symbol: string; name: string; price: number; change: number; changesPercentage: number };

// Real market-wide movers from FMP's free gainers/losers/actives endpoints.
// Returns [] gracefully (no key / failure / non-free tier) so callers can fall back.
export async function getFmpMovers(kind: "gainers" | "losers" | "actives"): Promise<FmpMover[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${FMP_BASE}/stock_market/${kind}?apikey=${key}`, { next: { revalidate: 120 } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((r) => r?.symbol && typeof r.price === "number" && r.price > 0)
      .map((r) => ({
        symbol: String(r.symbol).toUpperCase(),
        name: r.name ?? r.symbol,
        price: r.price,
        change: r.change ?? 0,
        changesPercentage: typeof r.changesPercentage === "number" ? r.changesPercentage : Number(String(r.changesPercentage ?? "0").replace(/[%()]/g, "")) || 0,
      }));
  } catch {
    return [];
  }
}
