// QuiverQuant API — congressional trading data (STOCK Act disclosures)
// Register for a free key at quiverquant.com. Set QUIVER_API_KEY in env.
// Docs: https://quiverquant.com/quiverapi/

export type CongressTrade = {
  ticker: string;
  representative: string;
  party: "Democrat" | "Republican" | "Independent" | string;
  chamber: "House" | "Senate" | string;
  state: string;
  transaction: "Purchase" | "Sale" | "Sale (Full)" | "Sale (Partial)" | "Exchange" | string;
  amount: string;         // e.g. "$1,001-$15,000" — range, not exact
  transactionDate: string; // YYYY-MM-DD
  reportDate: string;      // YYYY-MM-DD
};

type QuiverRow = {
  Ticker?: string;
  Representative?: string;
  Party?: string;
  Chamber?: string;
  State?: string;
  Transaction?: string;
  Amount?: string;
  TransactionDate?: string;
  ReportDate?: string;
};

function getKey(): string | null {
  return process.env.QUIVER_API_KEY ?? null;
}

function mapRow(row: QuiverRow, fallbackTicker?: string): CongressTrade {
  return {
    ticker:          row.Ticker ?? fallbackTicker ?? "",
    representative:  row.Representative ?? "Unknown",
    party:           row.Party ?? "",
    chamber:         row.Chamber ?? "",
    state:           row.State ?? "",
    transaction:     row.Transaction ?? "",
    amount:          row.Amount ?? "",
    transactionDate: row.TransactionDate ?? "",
    reportDate:      row.ReportDate ?? "",
  };
}

export async function getCongressTrades(ticker: string): Promise<CongressTrade[]> {
  const key = getKey();
  if (!key) return [];

  const sym = ticker.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  if (!sym) return [];

  try {
    const res = await fetch(
      `https://api.quiverquant.com/beta/historical/congresstrading/${sym}`,
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        next: { revalidate: 21_600 }, // cache 6 hours
      }
    );

    if (!res.ok) return [];

    const rows: QuiverRow[] = await res.json();
    if (!Array.isArray(rows)) return [];

    return rows
      .map((r) => mapRow(r, sym))
      .sort((a, b) =>
        new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      );
  } catch {
    return [];
  }
}

// Fetch the most recent trades across ALL tickers (useful for email digest cross-referencing).
// Returns up to ~100 rows (QuiverQuant live feed).
export async function getRecentCongressTrades(): Promise<CongressTrade[]> {
  const key = getKey();
  if (!key) return [];

  try {
    const res = await fetch(
      "https://api.quiverquant.com/beta/live/congresstrading",
      {
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
        },
        next: { revalidate: 21_600 },
      }
    );

    if (!res.ok) return [];

    const rows: QuiverRow[] = await res.json();
    if (!Array.isArray(rows)) return [];

    return rows
      .map((r) => mapRow(r))
      .sort((a, b) =>
        new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      );
  } catch {
    return [];
  }
}

// Format the dollar-range amount string into a short human-readable form.
export function formatCongressAmount(amount: string): string {
  if (!amount) return "";
  // "$1,001-$15,000" → "$1K–$15K"
  const clean = amount.replace(/\$/g, "").replace(/,/g, "");
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
