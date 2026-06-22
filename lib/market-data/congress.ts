// Congressional stock trades — FREE, no API key.
//
// Source: the public House/Senate STOCK Act disclosures (members of Congress must report
// securities trades within 45 days). The live data lives in S3 buckets that block requests
// from Vercel's serverless functions, so a scheduled GitHub Action (scripts/sync-congress.mjs,
// .github/workflows/congress-sync.yml) fetches + normalizes them from a GitHub-hosted runner
// and commits the trimmed snapshot below. This module just reads that snapshot — fast,
// reliable, and free (no live fetch on the request path).

import congressData from "./congress-data.json";

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

const SNAPSHOT = congressData as { trades: CongressTrade[]; updatedAt: string | null };

const LOOKBACK_DAYS = 180;
const MAX_TRADES = 300;

function buildActivity(all: CongressTrade[]): CongressActivity {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const recent = all
    .filter((t) => t.transactionDate && t.transactionDate >= cutoffIso)
    .sort((a, b) => (b.transactionDate < a.transactionDate ? -1 : b.transactionDate > a.transactionDate ? 1 : 0));

  const trades = recent.slice(0, MAX_TRADES);

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

  return { trades, topTickers, updatedAt: SNAPSHOT.updatedAt ?? new Date().toISOString() };
}

// Recent congressional trading activity (both chambers), built from the committed snapshot.
export async function getCongressActivity(): Promise<CongressActivity> {
  return buildActivity(SNAPSHOT.trades ?? []);
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
