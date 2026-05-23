// Congressional trading data via Financial Modeling Prep (FMP)
// Senate: /api/v4/senate-trading?symbol=AAPL&apikey=KEY
// House:  /api/v4/house-disclosure?symbol=AAPL&apikey=KEY
// Uses FMP_API_KEY (already required for benchmark data)

export type CongressTrade = {
  ticker: string;
  representative: string;
  party: string;
  chamber: "House" | "Senate" | string;
  state: string;
  transaction: string;
  amount: string;         // e.g. "$1,001 - $15,000"
  transactionDate: string; // YYYY-MM-DD
  reportDate: string;      // YYYY-MM-DD
};

type FMPSenateRow = {
  firstName?: string;
  lastName?: string;
  dateRecieved?: string; // FMP typos "Received"
  transactionDate?: string;
  type?: string;
  amount?: string;
  symbol?: string;
};

type FMPHouseRow = {
  representative?: string;
  disclosureDate?: string;
  transactionDate?: string;
  type?: string;
  amount?: string;
  ticker?: string;
  district?: string;
};

function getKey(): string | null {
  return process.env.FMP_API_KEY ?? null;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function mapSenateRow(row: FMPSenateRow, fallbackTicker: string): CongressTrade {
  return {
    ticker:          row.symbol ?? fallbackTicker,
    representative:  [row.firstName, row.lastName].filter(Boolean).join(" ") || "Unknown",
    party:           "",
    chamber:         "Senate",
    state:           "",
    transaction:     capitalize(row.type ?? ""),
    amount:          row.amount ?? "",
    transactionDate: row.transactionDate ?? "",
    reportDate:      row.dateRecieved ?? row.transactionDate ?? "",
  };
}

function mapHouseRow(row: FMPHouseRow, fallbackTicker: string): CongressTrade {
  const state = row.district ? row.district.split("-")[0] : "";
  return {
    ticker:          row.ticker ?? fallbackTicker,
    representative:  row.representative ?? "Unknown",
    party:           "",
    chamber:         "House",
    state,
    transaction:     capitalize(row.type ?? ""),
    amount:          row.amount ?? "",
    transactionDate: row.transactionDate ?? "",
    reportDate:      row.disclosureDate ?? row.transactionDate ?? "",
  };
}

export async function getCongressTrades(ticker: string): Promise<CongressTrade[]> {
  const key = getKey();
  if (!key) return [];

  const sym = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!sym) return [];

  try {
    const [senateRes, houseRes] = await Promise.all([
      fetch(
        `https://financialmodelingprep.com/api/v4/senate-trading?symbol=${sym}&apikey=${key}`,
        { next: { revalidate: 21_600 } }
      ),
      fetch(
        `https://financialmodelingprep.com/api/v4/house-disclosure?symbol=${sym}&apikey=${key}`,
        { next: { revalidate: 21_600 } }
      ),
    ]);

    const senate: FMPSenateRow[] = senateRes.ok ? await senateRes.json() : [];
    const house: FMPHouseRow[] = houseRes.ok ? await houseRes.json() : [];

    return [
      ...(Array.isArray(senate) ? senate.map((r) => mapSenateRow(r, sym)) : []),
      ...(Array.isArray(house) ? house.map((r) => mapHouseRow(r, sym)) : []),
    ].sort((a, b) =>
      new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
    );
  } catch {
    return [];
  }
}

// Kept for API compatibility — FMP has no cross-ticker live feed endpoint
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
