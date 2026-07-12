import { createClient } from "@supabase/supabase-js";
import type { BrokeragePosition, BrokerageActivity } from "./snaptrade";
import { getBenchmarkHistory } from "@/lib/market-data/finnhub-benchmark";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Durable price cache in the shared chart_cache table (service-role R/W). Reconstruction
// values many tickers at once; caching each ticker's history for a day keeps repeated
// rebuilds (and multiple accounts sharing a ticker) from re-hammering the price API and
// getting rate-limited. Fails open (no cache) if env/table is unavailable.
function priceAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCachedCloses(ticker: string): Promise<Map<string, number> | null> {
  const db = priceAdmin();
  if (!db) return null;
  try {
    const { data } = await db.from("chart_cache").select("result, expires_at").eq("cache_key", `recon:${ticker}`).single();
    if (!data || new Date(data.expires_at as string) <= new Date()) return null;
    const obj = (data.result as { closes?: Record<string, number> })?.closes;
    if (!obj) return null;
    return new Map(Object.entries(obj).map(([d, c]) => [d, Number(c)]));
  } catch {
    return null;
  }
}

async function setCachedCloses(ticker: string, m: Map<string, number>): Promise<void> {
  const db = priceAdmin();
  if (!db || m.size === 0) return;
  try {
    await db.from("chart_cache").upsert(
      { cache_key: `recon:${ticker}`, result: { closes: Object.fromEntries(m) }, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "cache_key" },
    );
  } catch { /* non-fatal */ }
}

// Reconstruct a linked account's real value history WITHOUT the broker's paid history
// API (which is 403 on the free tier). We replay the account's trades against historical
// market prices from FMP: shares held on any past day = current shares minus the net
// units traded after that day, valued at that day's close. This yields an accurate daily
// value line and a Modified-Dietz windowed return, using only endpoints that work on
// every tier (positions + activities) plus FMP prices we already integrate.

export type DailyValue = { date: string; value: number };

type Trade = { ticker: string; date: string; signedUnits: number; flow: number; rei: boolean };

// Daily close history for one ticker → Map<YYYY-MM-DD, close>. Serves from the durable
// cache first; otherwise pulls a wide (5Y) window via the project's proven multi-source
// fetcher (FMP → Finnhub → Twelve Data → Alpha Vantage) — one entry covers every window —
// with a single retry to ride out a transient rate-limit. Non-fatal → empty.
export async function fetchDailyCloses(symbol: string): Promise<Map<string, number>> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return new Map();
  const cached = await getCachedCloses(sym);
  if (cached && cached.size > 0) return cached;
  try {
    let bars = await getBenchmarkHistory(sym, "5Y", false, false);
    if (bars.length === 0) { await sleep(500); bars = await getBenchmarkHistory(sym, "5Y", false, false); }
    const m = new Map<string, number>();
    for (const b of bars) {
      if (b.date && Number.isFinite(b.close) && b.close > 0) m.set(b.date.slice(0, 10), b.close);
    }
    if (m.size > 0) await setCachedCloses(sym, m);
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
  coverage: number;        // reconstructed end value / actual current value (1.0 = whole)
  pricedCoverage: number;  // share of current value backed by REAL price history (not flat)
  benchSeries: DailyValue[];      // "same deposits in the benchmark" mirror line
  benchReturnPct: number | null;  // that mirror's money-weighted return over the window
  twrSeries: DailyValue[];        // deposit-free growth index (base 100) — pure stock growth
};

// Build the daily value series + windowed return for [startDate, endDate].
export async function reconstructValueSeries(
  positions: BrokeragePosition[],
  activities: BrokerageActivity[],
  cash: number,
  currentValue: number,
  startDate: string,
  endDate: string,
  benchSymbol = "SPY",
): Promise<ReconstructResult> {
  const currentShares: Record<string, number> = {};
  const currentPrice: Record<string, number> = {};
  const tickers = new Set<string>();
  for (const p of positions) {
    const tk = p.ticker.toUpperCase();
    currentShares[tk] = (currentShares[tk] ?? 0) + p.shares;
    if (p.price != null && p.price > 0) currentPrice[tk] = p.price;
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
      rei: isReinvest(a.type),
    });
  }

  // Prices per ticker (cache-first, so many tickers don't get rate-limited). Fetched with
  // small bounded concurrency so a many-holding account doesn't take too long or time out.
  const priceMaps: Record<string, Map<string, number>> = {};
  const sortedDatesByTicker: Record<string, string[]> = {};
  const tickerList = [...tickers];
  const CONCURRENCY = 3;
  for (let i = 0; i < tickerList.length; i += CONCURRENCY) {
    const batch = tickerList.slice(i, i + CONCURRENCY);
    const maps = await Promise.all(batch.map((tk) => fetchDailyCloses(tk)));
    batch.forEach((tk, j) => {
      priceMaps[tk] = maps[j];
      sortedDatesByTicker[tk] = [...maps[j].keys()].sort();
    });
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
  if (days.length === 0) return { series: [], returnPct: null, coverage: 0, pricedCoverage: 0, benchSeries: [], benchReturnPct: null, twrSeries: [] };
  const series: DailyValue[] = [];
  for (const day of days) {
    let v = cash; // current cash carried flat (small relative to holdings)
    for (const tk of tickers) {
      const sh = sharesOn(tk, day);
      if (sh <= 0) continue;
      let px = priceOn(sortedDatesByTicker[tk], priceMaps[tk], day);
      // No price history (options, crypto, exotic tickers) → value flat at the broker's
      // current price. Keeps the account whole (coverage ≈ 1) and return-neutral for that
      // holding instead of dropping it and distorting the reconstructed return.
      if (px <= 0) px = currentPrice[tk] ?? 0;
      if (px > 0) v += sh * px;
    }
    series.push({ date: day, value: Math.round(v * 100) / 100 });
  }

  // Keep only weekdays to avoid flat weekend runs (markets closed) — cleaner line.
  const weekdayed = series.filter((pt) => { const wd = new Date(pt.date + "T00:00:00Z").getUTCDay(); return wd !== 0 && wd !== 6; });
  let finalSeries = weekdayed.length >= 2 ? weekdayed : series;

  // Trim the leading dust run: before the portfolio really starts, the replayed value is
  // ~$0 or a few dollars of leftover fractional shares. Charting that reads as missing
  // data, and worse, the benchmark line gets rebased to that dust value (SPY showing "$12"
  // all chart long). Start the line where the portfolio meaningfully exists: at least $25
  // or 2% of today's value, whichever is larger.
  const floor = Math.max(25, currentValue * 0.02);
  const firstReal = finalSeries.findIndex((pt) => pt.value >= floor);
  if (firstReal > 0 && finalSeries.length - firstReal >= 2) finalSeries = finalSeries.slice(firstReal);

  const v0 = finalSeries[0]?.value ?? 0;
  const v1 = finalSeries[finalSeries.length - 1]?.value ?? currentValue;

  // IMPLIED daily cash flows. Per ticker per day: use the broker's actual FILL dollars
  // when a trade reports them (exact), and value only the residual share change at that
  // day's close (covers records with missing amounts). Reinvested-dividend shares are
  // income, not external cash, so they're excluded from flows entirely.
  //
  // Why hybrid: trusting trade amounts alone undercounts flows when records are missing
  // dollars (deposits read as +250% gain), while valuing ALL share changes at the close
  // ignores fill-vs-close gaps — noise that's catastrophic on a small base (a $5 gap on a
  // $30 day = a fake ±20% "return" chained into the growth index forever, which is how
  // YTD showed −23% on a growing account).
  const flowByIndex: number[] = new Array(finalSeries.length).fill(0);
  for (let i = 1; i < finalSeries.length; i++) {
    const dPrev = finalSeries[i - 1].date, dCur = finalSeries[i].date;
    let f = 0;
    for (const tk of tickers) {
      const dSh = sharesOn(tk, dCur) - sharesOn(tk, dPrev);
      const ts = tradesByTicker[tk] ?? [];
      // Trades in (dPrev, dCur] — weekend/holiday trades roll into the next series day.
      let fillFlow = 0, knownUnits = 0, reiUnits = 0;
      for (const t of ts) {
        if (t.date <= dPrev || t.date > dCur) continue;
        if (t.rei) { reiUnits += t.signedUnits; continue; }
        if (t.flow !== 0) { fillFlow += t.flow; knownUnits += t.signedUnits; }
      }
      const residualUnits = dSh - knownUnits - reiUnits;
      let fTk = fillFlow;
      if (residualUnits !== 0) {
        let px = priceOn(sortedDatesByTicker[tk], priceMaps[tk], dCur);
        if (px <= 0) px = currentPrice[tk] ?? 0;
        if (px > 0) fTk += residualUnits * px;
      }
      f += fTk;
    }
    flowByIndex[i] = f;
  }

  // Deposit-free growth index (time-weighted): each day's growth factor is the value
  // change with that day's flow removed — g_i = V_i / (V_{i-1} + f_i) — chained from 100.
  // This is "actual stock growth": a deposit moves the value line but not this index.
  // Used for the chart's timeframe stats (3M/1M/…), where raw value change would read
  // deposits as gains (+193% on a $700-deposit account).
  //
  // Robustness: growth is only measured once the portfolio is meaningful (≥5% of today's
  // value / $50) — before that the base is dust and tiny absolute errors chain into huge
  // fake returns (YTD −23% on a growing account). Days where the flow dwarfs the base
  // (account tripled by a deposit) are flow-neutral: market growth isn't measurable there.
  const twrSeries: DailyValue[] = [];
  {
    const meaningfulBase = Math.max(50, currentValue * 0.05);
    let idx = 100;
    let started = false;
    for (let i = 0; i < finalSeries.length; i++) {
      if (!started) {
        if (finalSeries[i].value >= meaningfulBase) {
          started = true;
          twrSeries.push({ date: finalSeries[i].date, value: 100 });
        }
        continue;
      }
      const prev = finalSeries[i - 1].value;
      const flow = flowByIndex[i];
      const base = prev + flow;
      let g = base > 1 ? finalSeries[i].value / base : 1;
      // Flow-dominated day: the deposit is large vs the existing base — the day's market
      // move can't be separated from fill effects, so treat it as flat.
      if (flow !== 0 && Math.abs(flow) > prev * 2) g = 1;
      // Clamp pathological factors (bad print on a tiny base) so one day can't wreck it.
      idx *= Math.min(2, Math.max(0.5, g));
      twrSeries.push({ date: finalSeries[i].date, value: Math.round(idx * 10000) / 10000 });
    }
    // Nothing meaningful in the window → no index (stats fall back gracefully).
  }

  // Modified Dietz over the trimmed window: return = (V1 − V0 − F) / (V0 + Σ w_i·F_i).
  // This is the money-weighted return — gain measured against every dollar put in, timed
  // when it was put in — which is what "my return" means on a deposit-funded account.
  const effStart = finalSeries[0]?.date ?? startDate;
  const effEnd = finalSeries[finalSeries.length - 1]?.date ?? endDate;
  const spanMs = new Date(effEnd).getTime() - new Date(effStart).getTime();
  let netFlow = 0, weightedFlow = 0;
  for (let i = 1; i < finalSeries.length; i++) {
    const f = flowByIndex[i];
    if (f === 0) continue;
    netFlow += f;
    const w = spanMs > 0 ? (new Date(effEnd).getTime() - new Date(finalSeries[i].date).getTime()) / spanMs : 0;
    weightedFlow += w * f;
  }
  const denom = v0 + weightedFlow;
  const denomOk = denom > Math.max(10, v1 * 0.05); // refuse a base too small to be meaningful
  const returnPct = denomOk ? Math.round(((v1 - v0 - netFlow) / denom) * 10000) / 100 : null;

  // Benchmark mirror: what the SAME money would be worth if every flow had bought the
  // benchmark instead — the honest comparison line for a deposit-funded value chart
  // (rebasing an index to the starting value is meaningless when the account grows by
  // deposits). Same flows, same window → directly comparable, including its own
  // money-weighted return for the SPY/Excess stats.
  let benchSeries: DailyValue[] = [];
  let benchReturnPct: number | null = null;
  try {
    const spyCloses = await fetchDailyCloses(benchSymbol);
    const spyDates = [...spyCloses.keys()].sort();
    const px0 = priceOn(spyDates, spyCloses, effStart);
    if (px0 > 0 && finalSeries.length >= 2) {
      let bmShares = v0 / px0;
      benchSeries = finalSeries.map((pt, i) => {
        const px = priceOn(spyDates, spyCloses, pt.date);
        if (i > 0 && flowByIndex[i] !== 0 && px > 0) bmShares += flowByIndex[i] / px;
        return { date: pt.date, value: px > 0 ? Math.round(bmShares * px * 100) / 100 : 0 };
      }).filter((pt) => pt.value > 0);
      const bm1 = benchSeries[benchSeries.length - 1]?.value ?? 0;
      if (denomOk && bm1 > 0) benchReturnPct = Math.round(((bm1 - v0 - netFlow) / denom) * 10000) / 100;
    }
  } catch { /* benchmark mirror is best-effort */ }

  // Overall coverage = how whole the account is (flat-filled holdings count). Priced
  // coverage = how much of the current value has REAL price history (flat-filled excluded)
  // — this is what tells us the reconstructed RETURN is trustworthy.
  const coverage = currentValue > 0 ? v1 / currentValue : 0;
  let pricedValueNow = 0;
  for (const tk of tickers) {
    const sh = sharesOn(tk, endDate);
    if (sh <= 0) continue;
    if ((priceMaps[tk]?.size ?? 0) > 0) {
      const px = priceOn(sortedDatesByTicker[tk], priceMaps[tk], endDate);
      if (px > 0) pricedValueNow += sh * px;
    }
  }
  const pricedCoverage = currentValue > 0 ? pricedValueNow / currentValue : 0;
  return { series: finalSeries, returnPct, coverage, pricedCoverage, benchSeries, benchReturnPct, twrSeries };
}
