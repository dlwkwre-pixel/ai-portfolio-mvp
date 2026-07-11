import type { BrokeragePosition, BrokerageActivity } from "./snaptrade";

// Reconstruct a linked account's real value history WITHOUT the broker's paid history
// API (which is 403 on the free tier). We replay the account's trades against historical
// market prices from FMP: shares held on any past day = current shares minus the net
// units traded after that day, valued at that day's close. This yields an accurate daily
// value line and a Modified-Dietz windowed return, using only endpoints that work on
// every tier (positions + activities) plus FMP prices we already integrate.

export type DailyValue = { date: string; value: number };

type Trade = { ticker: string; date: string; signedUnits: number; flow: number };

// FMP full daily history for one ticker → Map<YYYY-MM-DD, close>. Non-fatal → empty.
async function fetchDailyCloses(symbol: string): Promise<Map<string, number>> {
  const key = process.env.FMP_API_KEY;
  if (!key) return new Map();
  const sym = symbol.trim().toUpperCase();
  if (!sym) return new Map();
  const url = `https://financialmodelingprep.com/api/v3/historical-price-full/${encodeURIComponent(sym)}?apikey=${key}`;
  try {
    const res = await fetch(url, { next: { revalidate: 21600 } });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { historical?: Array<{ date?: string; close?: number | string; adjClose?: number | string }> };
    const rows = Array.isArray(data?.historical) ? data.historical : [];
    const m = new Map<string, number>();
    for (const r of rows) {
      const d = String(r.date ?? "").slice(0, 10);
      const c = Number(r.close ?? r.adjClose ?? 0);
      if (d && Number.isFinite(c) && c > 0) m.set(d, c);
    }
    return m;
  } catch {
    return new Map();
  }
}

const isBuyType = (t: string) => { const s = t.toLowerCase(); return s.includes("buy") || s.includes("reinvest") || s === "rei"; };
const isSellType = (t: string) => t.toLowerCase().includes("sell");
// Reinvested-dividend buys add shares but are NOT external capital (they're income), so
// they don't count as an inflow in the return.
const isReinvest = (t: string) => { const s = t.toLowerCase(); return s.includes("reinvest") || s === "rei"; };

function dateList(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

// Carry-forward price lookup: the close on `day`, else the most recent close before it.
function priceOn(sortedDates: string[], closes: Map<string, number>, day: string): number {
  if (closes.has(day)) return closes.get(day)!;
  // binary search for the last date <= day
  let lo = 0, hi = sortedDates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDates[mid] <= day) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans >= 0 ? closes.get(sortedDates[ans])! : 0;
}

export type ReconstructResult = {
  series: DailyValue[];
  returnPct: number | null;
  coverage: number; // reconstructed end value / actual current value (1.0 = perfect)
};

// Build the daily value series + windowed return for [startDate, endDate].
export async function reconstructValueSeries(
  positions: BrokeragePosition[],
  activities: BrokerageActivity[],
  cash: number,
  currentValue: number,
  startDate: string,
  endDate: string,
): Promise<ReconstructResult> {
  const currentShares: Record<string, number> = {};
  const tickers = new Set<string>();
  for (const p of positions) {
    const tk = p.ticker.toUpperCase();
    currentShares[tk] = (currentShares[tk] ?? 0) + p.shares;
    tickers.add(tk);
  }

  const trades: Trade[] = [];
  for (const a of activities) {
    if (!a.ticker) continue;
    if (!isBuyType(a.type) && !isSellType(a.type)) continue;
    const date = (a.date ?? "").slice(0, 10);
    if (!date) continue;
    const tk = a.ticker.toUpperCase();
    tickers.add(tk);
    const units = Math.abs(a.units) || 0;
    const amount = Math.abs(a.amount) || Math.abs(a.units * a.price) || 0;
    const buy = isBuyType(a.type);
    trades.push({
      ticker: tk,
      date,
      signedUnits: buy ? units : -units,
      flow: isReinvest(a.type) ? 0 : (buy ? amount : -amount),
    });
  }

  // Prices per ticker.
  const priceMaps: Record<string, Map<string, number>> = {};
  const sortedDatesByTicker: Record<string, string[]> = {};
  for (const tk of tickers) {
    const m = await fetchDailyCloses(tk);
    priceMaps[tk] = m;
    sortedDatesByTicker[tk] = [...m.keys()].sort();
  }

  // shares(tk, day) = currentShares − Σ signedUnits(trades on tk with date > day).
  const tradesByTicker: Record<string, Trade[]> = {};
  for (const t of trades) (tradesByTicker[t.ticker] ??= []).push(t);
  for (const tk of Object.keys(tradesByTicker)) tradesByTicker[tk].sort((a, b) => a.date.localeCompare(b.date));

  function sharesOn(tk: string, day: string): number {
    let s = currentShares[tk] ?? 0;
    const ts = tradesByTicker[tk] ?? [];
    for (let i = ts.length - 1; i >= 0; i--) {
      if (ts[i].date > day) s -= ts[i].signedUnits; else break;
    }
    return s;
  }

  const days = dateList(startDate, endDate);
  if (days.length === 0) return { series: [], returnPct: null, coverage: 0 };
  const series: DailyValue[] = [];
  for (const day of days) {
    let v = cash; // current cash carried flat (small relative to holdings)
    for (const tk of tickers) {
      const sh = sharesOn(tk, day);
      if (sh <= 0) continue;
      const px = priceOn(sortedDatesByTicker[tk], priceMaps[tk], day);
      if (px > 0) v += sh * px;
    }
    series.push({ date: day, value: Math.round(v * 100) / 100 });
  }

  // Keep only weekdays to avoid flat weekend runs (markets closed) — cleaner line.
  const weekdayed = series.filter((pt) => { const wd = new Date(pt.date + "T00:00:00Z").getUTCDay(); return wd !== 0 && wd !== 6; });
  const finalSeries = weekdayed.length >= 2 ? weekdayed : series;

  const v0 = finalSeries[0]?.value ?? 0;
  const v1 = finalSeries[finalSeries.length - 1]?.value ?? currentValue;

  // Modified Dietz over the window: return = (V1 − V0 − F) / (V0 + Σ w_i·F_i), where the
  // flows F_i are trade cash (buys +, sells −) — NOT deposits, so the polluted deposit
  // data never enters the return.
  const spanMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  let netFlow = 0, weightedFlow = 0;
  for (const t of trades) {
    if (t.date <= startDate || t.date > endDate || t.flow === 0) continue;
    netFlow += t.flow;
    const w = spanMs > 0 ? (new Date(endDate).getTime() - new Date(t.date).getTime()) / spanMs : 0;
    weightedFlow += w * t.flow;
  }
  const denom = v0 + weightedFlow;
  const returnPct = denom > 0 ? Math.round(((v1 - v0 - netFlow) / denom) * 10000) / 100 : null;

  const coverage = currentValue > 0 ? v1 / currentValue : 0;
  return { series: finalSeries, returnPct, coverage };
}
