// Congressional stock trades — FREE, no API key.
//
// Source: the public House/Senate Stock Watcher datasets, which mirror the official
// STOCK Act disclosures (members of Congress must report securities trades within 45 days).
// Hosted as plain JSON on S3, daily-updated, $0:
//   House:  https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json
//   Senate: https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json
//
// These aggregate files are large (tens of MB) and exceed Next's 2MB fetch-cache ceiling, so
// instead of Next data caching we fetch fresh + memoize the trimmed, normalized result in a
// module-level cache with a TTL. Everything fails gracefully to [] so the research page never
// breaks when a dataset is briefly unavailable.

// Senate via raw.githubusercontent (verified reachable + maintained by GH Actions).
// House via S3 (best-effort) with a raw.githubusercontent fallback if S3 blocks the request.
const SENATE_URL = "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_transactions.json";
const HOUSE_URLS = [
  "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json",
  "https://raw.githubusercontent.com/timothycarambat/house-stock-watcher-data/master/data/all_transactions.json",
];

export type CongressTrade = {
  chamber: "house" | "senate";
  person: string;
  ticker: string;
  assetName: string;
  txType: "buy" | "sell" | "exchange";
  amountRange: string;
  amountMid: number;        // midpoint of the disclosed dollar range, for sorting/aggregation
  transactionDate: string;  // yyyy-mm-dd
  disclosureDate: string;   // yyyy-mm-dd
  ptrLink: string | null;
};

export type CongressTickerSummary = {
  ticker: string;
  buys: number;
  sells: number;
  net: number;              // buys - sells
  tradeCount: number;
  notionalMid: number;      // summed midpoint dollars
  people: string[];         // distinct names, most recent first
  lastTraded: string;       // yyyy-mm-dd
};

export type CongressActivity = {
  trades: CongressTrade[];          // recent, newest first
  topTickers: CongressTickerSummary[];
  updatedAt: string;
};

// ── Parsing helpers ────────────────────────────────────────────────────────────

// Disclosed amounts are ranges like "$1,001 - $15,000". Returns the midpoint in dollars.
function amountMidpoint(raw: string): number {
  if (!raw) return 0;
  const nums = raw.replace(/[$,]/g, "").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return 0;
  const vals = nums.map(Number).filter((n) => Number.isFinite(n));
  if (vals.length === 0) return 0;
  if (vals.length === 1) return vals[0];
  return (vals[0] + vals[1]) / 2;
}

// Datasets mix "yyyy-mm-dd" and "mm/dd/yyyy". Normalize to yyyy-mm-dd; "" if unparseable.
function toIsoDate(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mm, dd, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function normalizeType(raw: string): CongressTrade["txType"] | null {
  const t = (raw || "").toLowerCase();
  if (t.includes("purchase") || t === "buy") return "buy";
  if (t.includes("sale") || t.includes("sold") || t === "sell") return "sell";
  if (t.includes("exchange")) return "exchange";
  return null;
}

const VALID_TICKER = /^[A-Z][A-Z.]{0,5}$/;
function cleanTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!t || t === "--" || t === "N/A" || t.includes("<")) return null;
  return VALID_TICKER.test(t) ? t : null;
}

async function fetchJsonArray(url: string, timeoutMs = 9000): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "BuyTune/1.0 (+https://buytuneio.vercel.app)", Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Try each URL in order, returning the first that yields a non-empty array.
async function fetchJsonArrayFromAny(urls: string[]): Promise<unknown[]> {
  for (const u of urls) {
    const arr = await fetchJsonArray(u);
    if (arr.length > 0) return arr;
  }
  return [];
}

function normalizeHouse(rows: unknown[]): CongressTrade[] {
  const out: CongressTrade[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const ticker = cleanTicker(r.ticker);
    const txType = normalizeType(String(r.type ?? ""));
    if (!ticker || !txType) continue;
    const amountRange = String(r.amount ?? "").trim();
    out.push({
      chamber: "house",
      person: String(r.representative ?? "").replace(/^Hon\.\s*/i, "").trim() || "Unknown",
      ticker,
      assetName: String(r.asset_description ?? "").trim().slice(0, 80),
      txType,
      amountRange,
      amountMid: amountMidpoint(amountRange),
      transactionDate: toIsoDate(String(r.transaction_date ?? "")),
      disclosureDate: toIsoDate(String(r.disclosure_date ?? "")),
      ptrLink: typeof r.ptr_link === "string" ? r.ptr_link : null,
    });
  }
  return out;
}

function normalizeSenate(rows: unknown[]): CongressTrade[] {
  const out: CongressTrade[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    const ticker = cleanTicker(r.ticker);
    const txType = normalizeType(String(r.type ?? ""));
    if (!ticker || !txType) continue;
    const amountRange = String(r.amount ?? "").trim();
    out.push({
      chamber: "senate",
      person: String(r.senator ?? "").trim() || "Unknown",
      ticker,
      assetName: String(r.asset_description ?? "").trim().slice(0, 80),
      txType,
      amountRange,
      amountMid: amountMidpoint(amountRange),
      transactionDate: toIsoDate(String(r.transaction_date ?? "")),
      disclosureDate: toIsoDate(String(r.disclosure_date ?? "")),
      ptrLink: typeof r.ptr_link === "string" ? r.ptr_link : null,
    });
  }
  return out;
}

// ── Module-level TTL cache (per warm serverless instance) ────────────────────────

let cache: { data: CongressActivity; expires: number } | null = null;
const TTL_MS = 12 * 60 * 60 * 1000; // 12h
const LOOKBACK_DAYS = 180; // disclosures lag (filed within 45 days, dataset refreshes periodically)
const MAX_TRADES = 300;

function buildActivity(all: CongressTrade[]): CongressActivity {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const recent = all
    .filter((t) => t.transactionDate && t.transactionDate >= cutoffIso)
    .sort((a, b) => (b.transactionDate < a.transactionDate ? -1 : b.transactionDate > a.transactionDate ? 1 : 0));

  const trades = recent.slice(0, MAX_TRADES);

  // Aggregate by ticker across the recent window.
  const byTicker = new Map<string, CongressTickerSummary>();
  for (const t of recent) {
    let s = byTicker.get(t.ticker);
    if (!s) {
      s = { ticker: t.ticker, buys: 0, sells: 0, net: 0, tradeCount: 0, notionalMid: 0, people: [], lastTraded: t.transactionDate };
      byTicker.set(t.ticker, s);
    }
    if (t.txType === "buy") s.buys++;
    else if (t.txType === "sell") s.sells++;
    s.tradeCount++;
    s.notionalMid += t.amountMid;
    if (!s.people.includes(t.person) && s.people.length < 8) s.people.push(t.person);
    if (t.transactionDate > s.lastTraded) s.lastTraded = t.transactionDate;
  }
  for (const s of byTicker.values()) s.net = s.buys - s.sells;

  const topTickers = [...byTicker.values()]
    .sort((a, b) => b.tradeCount - a.tradeCount || b.notionalMid - a.notionalMid)
    .slice(0, 25);

  return { trades, topTickers, updatedAt: new Date().toISOString() };
}

// Recent congressional trading activity (both chambers), normalized + aggregated.
// Memoized for TTL_MS per warm instance. Returns empty activity on total failure.
export async function getCongressActivity(): Promise<CongressActivity> {
  if (cache && cache.expires > Date.now()) return cache.data;
  try {
    const [house, senate] = await Promise.all([
      fetchJsonArrayFromAny(HOUSE_URLS).then(normalizeHouse).catch(() => [] as CongressTrade[]),
      fetchJsonArray(SENATE_URL).then(normalizeSenate).catch(() => [] as CongressTrade[]),
    ]);
    const all = [...house, ...senate];
    if (all.length === 0 && cache) return cache.data; // keep last good data on a transient miss
    const data = buildActivity(all);
    cache = { data, expires: Date.now() + TTL_MS };
    return data;
  } catch {
    return cache?.data ?? { trades: [], topTickers: [], updatedAt: new Date().toISOString() };
  }
}

// Per-ticker signal for the research detail view: recent congressional trades in one symbol.
export async function getCongressTradesForTicker(ticker: string): Promise<{
  ticker: string;
  summary: CongressTickerSummary | null;
  trades: CongressTrade[];
}> {
  const t = ticker.trim().toUpperCase();
  const activity = await getCongressActivity();
  const summary = activity.topTickers.find((s) => s.ticker === t) ?? null;
  const trades = activity.trades.filter((tr) => tr.ticker === t).slice(0, 20);
  return { ticker: t, summary, trades };
}
