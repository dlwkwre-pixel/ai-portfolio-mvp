// FMP retired the /api/v3 tier after Aug 31 2025 — every v3 endpoint now 403s with
// "Legacy Endpoint". /stable is the replacement. Multi-symbol quote requests are
// gated behind a higher subscription tier on /stable (402 Premium), so getFmpQuotes
// fetches one ticker per request instead of one batched call.
const FMP_BASE = "https://financialmodelingprep.com/stable";

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
  changePercentage?: number; // /stable/quote field name (no "s")
};

// This plan tier's rate limit is low enough to 429 after a handful of rapid
// requests (observed directly) — stay conservative rather than silently drop quotes.
const QUOTE_BATCH_SIZE = 3;
const QUOTE_BATCH_DELAY_MS = 800;

/**
 * Fetch quotes for one or more tickers from FMP's /stable/quote endpoint.
 * Batched one request per ticker (this plan tier doesn't support comma-separated
 * multi-symbol quotes). Returns a map from uppercase ticker → FmpQuote. Missing or
 * failed tickers are absent.
 */
export async function getFmpQuotes(tickers: string[]): Promise<Map<string, FmpQuote>> {
  const key = process.env.FMP_API_KEY;
  const result = new Map<string, FmpQuote>();
  if (!key || tickers.length === 0) return result;

  const symbols = [...new Set(tickers.map((t) => t.toUpperCase()))];

  for (let i = 0; i < symbols.length; i += QUOTE_BATCH_SIZE) {
    const batch = symbols.slice(i, i + QUOTE_BATCH_SIZE);
    await Promise.all(batch.map(async (symbol) => {
      try {
        const res = await fetch(`${FMP_BASE}/quote?symbol=${symbol}&apikey=${key}`, { next: { revalidate: 60 } });
        if (!res.ok) return;
        const data: FmpRawQuote[] = await res.json();
        const row = Array.isArray(data) ? data[0] : null;
        if (!row?.symbol || typeof row.price !== "number" || row.price === 0) return;
        result.set(row.symbol.toUpperCase(), {
          symbol: row.symbol.toUpperCase(),
          price: row.price,
          change: row.change ?? 0,
          changesPercentage: row.changePercentage ?? 0,
        });
      } catch { /* leave unset */ }
    }));
    if (i + QUOTE_BATCH_SIZE < symbols.length) await new Promise((r) => setTimeout(r, QUOTE_BATCH_DELAY_MS));
  }

  return result;
}

export type FmpScreenResult = { symbol: string; name: string };

// FMP stock screener — used to auto-populate research sections (growth/dividend/defensive)
// by their defining characteristics instead of a hardcoded list. Returns [] gracefully.
export async function getFmpScreen(params: Record<string, string | number>): Promise<FmpScreenResult[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), isActivelyTrading: "true", exchange: "NASDAQ,NYSE", apikey: key });
  try {
    const res = await fetch(`${FMP_BASE}/stock-screener?${qs.toString()}`, { next: { revalidate: 21600 } }); // 6h
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((r) => r?.symbol && /^[A-Z.]{1,6}$/.test(r.symbol)) // skip odd/foreign symbols
      .map((r) => ({ symbol: String(r.symbol).toUpperCase(), name: r.companyName ?? r.symbol }));
  } catch {
    return [];
  }
}

export type FmpMover = { symbol: string; name: string; price: number; change: number; changesPercentage: number };

const MOVER_PATH: Record<"gainers" | "losers" | "actives", string> = {
  gainers: "biggest-gainers",
  losers: "biggest-losers",
  actives: "most-actives",
};

// Real market-wide movers from FMP's gainers/losers/actives endpoints.
// Returns [] gracefully (no key / failure / non-free tier) so callers can fall back.
export async function getFmpMovers(kind: "gainers" | "losers" | "actives"): Promise<FmpMover[]> {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${FMP_BASE}/${MOVER_PATH[kind]}?apikey=${key}`, { next: { revalidate: 120 } });
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

// ── Dividends ───────────────────────────────────────────────────────────────
export type FmpDividend = {
  exDate: string;            // ex-dividend date (YYYY-MM-DD)
  perShare: number;          // dividend per share
  recordDate: string | null;
  paymentDate: string | null;
  declarationDate: string | null;
};

// Per-symbol dividend history (+ any future-declared entries).
export async function getFmpDividends(symbol: string): Promise<FmpDividend[]> {
  const key = process.env.FMP_API_KEY;
  if (!key || !symbol) return [];
  const url = `${FMP_BASE}/dividends?symbol=${encodeURIComponent(symbol.toUpperCase())}&apikey=${key}`;
  try {
    const res = await fetch(url, { next: { revalidate: 21600 } }); // 6h
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [];
    return rows
      .map((r: Record<string, unknown>) => ({
        exDate: String(r.date ?? ""),
        perShare: Number(r.adjDividend ?? r.dividend ?? 0),
        recordDate: (r.recordDate as string) || null,
        paymentDate: (r.paymentDate as string) || null,
        declarationDate: (r.declarationDate as string) || null,
      }))
      .filter((d: FmpDividend) => d.exDate && d.perShare > 0)
      .sort((a: FmpDividend, b: FmpDividend) => b.exDate.localeCompare(a.exDate));
  } catch {
    return [];
  }
}
