// Congressional trading data via Senate/House Stock Watcher public S3 datasets
// No API key required — data sourced from STOCK Act disclosures
// Senate: https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json
// House:  https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json

export type CongressTrade = {
  ticker: string;
  representative: string;
  party: string;
  chamber: "House" | "Senate" | string;
  state: string;
  transaction: string;
  amount: string;           // e.g. "$1,001 - $15,000"
  transactionDate: string;  // YYYY-MM-DD
  reportDate: string;       // YYYY-MM-DD
};

type SenateRow = {
  ticker?: string;
  senator?: string;
  type?: string;
  amount?: string;
  transaction_date?: string;
  disclosure_date?: string;
  state?: string;
};

type HouseRow = {
  ticker?: string;
  representative?: string;
  type?: string;
  amount?: string;
  transaction_date?: string;
  disclosure_date?: string;
  district?: string;
};

// Module-level cache: shared across all requests in the same server process
let _senateCache: { data: SenateRow[]; fetchedAt: number } | null = null;
let _houseCache:  { data: HouseRow[];  fetchedAt: number } | null = null;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

async function getSenate(): Promise<SenateRow[]> {
  const now = Date.now();
  if (_senateCache && now - _senateCache.fetchedAt < CACHE_TTL) return _senateCache.data;
  try {
    const res = await fetch(
      "https://senate-stock-watcher-data.s3-us-west-2.amazonaws.com/aggregate/all_transactions.json",
      { next: { revalidate: 21_600 }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return _senateCache?.data ?? [];
    const data = await res.json() as SenateRow[];
    _senateCache = { data: Array.isArray(data) ? data : [], fetchedAt: now };
    return _senateCache.data;
  } catch {
    return _senateCache?.data ?? [];
  }
}

async function getHouse(): Promise<HouseRow[]> {
  const now = Date.now();
  if (_houseCache && now - _houseCache.fetchedAt < CACHE_TTL) return _houseCache.data;
  try {
    const res = await fetch(
      "https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json",
      { next: { revalidate: 21_600 }, signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return _houseCache?.data ?? [];
    const data = await res.json() as HouseRow[];
    _houseCache = { data: Array.isArray(data) ? data : [], fetchedAt: now };
    return _houseCache.data;
  } catch {
    return _houseCache?.data ?? [];
  }
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

export async function getCongressTrades(ticker: string): Promise<CongressTrade[]> {
  const sym = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!sym) return [];

  const [senate, house] = await Promise.all([getSenate(), getHouse()]);

  const senateRows = senate
    .filter((r) => (r.ticker ?? "").toUpperCase() === sym)
    .map((r): CongressTrade => ({
      ticker:          sym,
      representative:  r.senator ?? "Unknown",
      party:           "",
      chamber:         "Senate",
      state:           r.state ?? "",
      transaction:     capitalize(r.type ?? ""),
      amount:          r.amount ?? "",
      transactionDate: r.transaction_date ?? "",
      reportDate:      r.disclosure_date ?? r.transaction_date ?? "",
    }));

  const houseRows = house
    .filter((r) => (r.ticker ?? "").toUpperCase() === sym)
    .map((r): CongressTrade => {
      const state = r.district ? r.district.replace(/\d+$/, "").trim() : "";
      return {
        ticker:          sym,
        representative:  r.representative ?? "Unknown",
        party:           "",
        chamber:         "House",
        state,
        transaction:     capitalize(r.type ?? ""),
        amount:          r.amount ?? "",
        transactionDate: r.transaction_date ?? "",
        reportDate:      r.disclosure_date ?? r.transaction_date ?? "",
      };
    });

  return [...senateRows, ...houseRows].sort((a, b) =>
    new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
  );
}

// Kept for API compatibility
export async function getRecentCongressTrades(): Promise<CongressTrade[]> {
  return [];
}

export function formatCongressAmount(amount: string): string {
  if (!amount) return "";
  const clean = amount.replace(/\$/g, "").replace(/,/g, "").replace(/\s/g, "");
  const parts = clean.split("-").map((p) => {
    const n = parseInt(p.trim(), 10);
    if (isNaN(n)) return p.trim();
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
    return `$${n}`;
  });
  return parts.join("–");
}

export function congressPartyColor(party: string): string {
  const p = party.toLowerCase();
  if (p.includes("dem") || p === "d") return "#3b82f6";
  if (p.includes("rep") || p === "r") return "#ef4444";
  return "#64748b";
}

export function isSale(transaction: string): boolean {
  return /sale/i.test(transaction);
}
