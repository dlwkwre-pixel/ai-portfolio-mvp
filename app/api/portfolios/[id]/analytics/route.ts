import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { getFinnhubProfile, getFinnhubFactorMetrics } from "@/lib/market-data/finnhub";
import { getBenchmarkHistory } from "@/lib/market-data/finnhub-benchmark";
import { computeFactorTilt, type FactorInput } from "@/lib/portfolio/factor-tilt";
import { buildOpenLots, accountIsTaxable, type RawLot } from "@/lib/portfolio/tax-lots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Pearson correlation of two equal-length series.
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; cov += da * db; va += da * da; vb += db * db; }
  if (va === 0 || vb === 0) return 0;
  return Math.max(-1, Math.min(1, cov / Math.sqrt(va * vb)));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership.
  const { data: portfolio } = await supabase
    .from("portfolios").select("id, cash_balance, account_type").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: holdings } = await supabase
    .from("holdings")
    .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .eq("portfolio_id", id);

  const rows = holdings ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ sectors: [], correlation: null, totalValue: 0 });
  }

  // Value to get per-holding market values (weights the exposure + picks top holdings).
  let valued: { ticker: string; market_value: number; asset_type: string | null }[] = [];
  try {
    const val = await getPortfolioValuation({
      holdings: rows.map((h) => ({ id: h.id, ticker: h.ticker, company_name: h.company_name, asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis, manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at })),
      cashBalance: Number(portfolio.cash_balance ?? 0),
    });
    valued = val.valued_holdings
      .filter((h) => (h.market_value ?? 0) > 0)
      .map((h) => ({ ticker: h.ticker, market_value: h.market_value ?? 0, asset_type: h.asset_type ?? null }));
  } catch { /* fall through with empty */ }

  if (valued.length === 0) return NextResponse.json({ sectors: [], correlation: null, totalValue: 0 });
  const totalValue = valued.reduce((s, h) => s + h.market_value, 0);

  // ── Sector exposure (top 20 positions by value) ──
  const topForSector = [...valued].sort((a, b) => b.market_value - a.market_value).slice(0, 20);
  const sectorMap = new Map<string, number>();
  const sectorByTicker = new Map<string, string>();
  await Promise.all(topForSector.map(async (h) => {
    let label = "Other / Fund";
    if (h.asset_type === "crypto") label = "Crypto";
    else if (h.asset_type === "manual") label = "Non-tradeable";
    else {
      try { const p = await getFinnhubProfile(h.ticker); if (p?.industry) label = p.industry; } catch { /* keep default */ }
    }
    sectorByTicker.set(h.ticker, label);
    sectorMap.set(label, (sectorMap.get(label) ?? 0) + h.market_value);
  }));
  const sectors = [...sectorMap.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value), pct: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);

  // ── Correlation matrix (top 8 stock/etf positions; needs daily history) ──
  const corrTickers = [...valued]
    .filter((h) => h.asset_type !== "manual")
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 8)
    .map((h) => h.ticker);

  let correlation: { tickers: string[]; matrix: number[][] } | null = null;
  if (corrTickers.length >= 2) {
    // Use the same robust history source as the backtester (FMP dividend-adjusted
    // with Finnhub/TwelveData/AlphaVantage fallbacks). Finnhub's /stock/candle is
    // premium-only on the free tier, so it can't power this on its own.
    const series = await Promise.all(corrTickers.map(async (t) => {
      try {
        const bars = await getBenchmarkHistory(t, "6M", false, false);
        if (!bars || bars.length < 8) return null;
        const byDate = new Map<string, number>();
        for (const b of bars) byDate.set(b.date, b.adjClose);
        return { ticker: t, byDate };
      } catch { return null; }
    }));
    const ok = series.filter((s): s is { ticker: string; byDate: Map<string, number> } => s != null);
    if (ok.length >= 2) {
      // Common dates across all available series, sorted ascending.
      let common: string[] = [...ok[0].byDate.keys()];
      for (const s of ok.slice(1)) common = common.filter((d) => s.byDate.has(d));
      common.sort((a, b) => a.localeCompare(b));
      if (common.length >= 6) {
        const returns = ok.map((s) => {
          const closes = common.map((d) => s.byDate.get(d)!);
          const r: number[] = [];
          for (let i = 1; i < closes.length; i++) r.push(closes[i - 1] !== 0 ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0);
          return r;
        });
        const matrix = ok.map((_, i) => ok.map((__, j) => Number(pearson(returns[i], returns[j]).toFixed(2))));
        correlation = { tickers: ok.map((s) => s.ticker), matrix };
      }
    }
  }

  // ── Factor / style tilt (top 15 stock positions; free Finnhub fundamentals) ──
  const factorTickers = [...valued]
    .filter((h) => h.asset_type !== "manual" && h.asset_type !== "crypto")
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 15);

  const betaByTicker = new Map<string, number>();
  let factors = null;
  if (factorTickers.length > 0) {
    const metricResults = await Promise.all(factorTickers.map(async (h) => {
      try {
        const m = await getFinnhubFactorMetrics(h.ticker);
        if (m?.beta != null) betaByTicker.set(h.ticker, m.beta);
        return m ? ({ ticker: h.ticker, value: h.market_value, metrics: m } as FactorInput) : null;
      } catch { return null; }
    }));
    const inputs = metricResults.filter((x): x is FactorInput => x != null);
    factors = computeFactorTilt(inputs);
  }

  // ── Per-holding detail for the what-if simulator (top 30 by value) ──
  const simHoldings = [...valued]
    .sort((a, b) => b.market_value - a.market_value)
    .slice(0, 30)
    .map((h) => ({
      ticker: h.ticker,
      value: Math.round(h.market_value),
      sector: sectorByTicker.get(h.ticker)
        ?? (h.asset_type === "crypto" ? "Crypto" : h.asset_type === "manual" ? "Non-tradeable" : "Other / Fund"),
      beta: betaByTicker.get(h.ticker) ?? null,
    }));

  // ── Tax-loss harvesting scanner (taxable accounts with real lots) ──
  // Open lots (FIFO after sells) priced at today's market value; lots underwater flag
  // their loss, term, and wash-sale risk (a buy of the same ticker in the last 30 days
  // would disallow the loss if sold now).
  type HarvestCandidate = { ticker: string; purchasedAt: string; shares: number; costPerShare: number; price: number; loss: number; longTerm: boolean; washSaleRisk: boolean };
  let harvest: {
    taxable: boolean;
    totalLoss: number; stLoss: number; ltLoss: number;
    candidates: HarvestCandidate[];
  } | null = null;
  try {
    const taxable = accountIsTaxable(portfolio.account_type as string | null);
    const priceByTicker = new Map<string, number>();
    for (const h of valued) {
      const row = rows.find((r) => String(r.ticker).toUpperCase() === h.ticker.toUpperCase());
      const shares = Number(row?.shares ?? 0);
      if (shares > 0) priceByTicker.set(h.ticker.toUpperCase(), h.market_value / shares);
    }

    const [{ data: lotRows }, { data: recentBuys }] = await Promise.all([
      supabase.from("holding_lots").select("ticker, lot_type, purchased_at, shares, price_per_share").eq("portfolio_id", id),
      supabase.from("portfolio_transactions").select("ticker, transaction_type, traded_at").eq("portfolio_id", id)
        .eq("transaction_type", "buy")
        .gte("traded_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    if (taxable && lotRows && lotRows.length > 0) {
      const recentBuyTickers = new Set((recentBuys ?? []).map((t) => String(t.ticker).toUpperCase()));
      const byTicker = new Map<string, RawLot[]>();
      for (const l of lotRows) {
        const tk = String(l.ticker).toUpperCase();
        const arr = byTicker.get(tk) ?? [];
        arr.push(l as RawLot);
        byTicker.set(tk, arr);
      }
      const candidates: HarvestCandidate[] = [];
      let stLoss = 0, ltLoss = 0;
      for (const [tk, lots] of byTicker) {
        const price = priceByTicker.get(tk);
        if (!price || price <= 0) continue;
        for (const lot of buildOpenLots(lots)) {
          if (price >= lot.costPerShare * 0.995) continue; // not meaningfully underwater
          const loss = Math.round((lot.costPerShare - price) * lot.shares * 100) / 100;
          if (loss < 1) continue;
          if (lot.longTerm) ltLoss += loss; else stLoss += loss;
          candidates.push({
            ticker: tk,
            purchasedAt: lot.purchasedAt,
            shares: Math.round(lot.shares * 1e6) / 1e6,
            costPerShare: Math.round(lot.costPerShare * 100) / 100,
            price: Math.round(price * 100) / 100,
            loss,
            longTerm: lot.longTerm,
            washSaleRisk: recentBuyTickers.has(tk),
          });
        }
      }
      candidates.sort((a, b) => b.loss - a.loss);
      harvest = {
        taxable: true,
        totalLoss: Math.round((stLoss + ltLoss) * 100) / 100,
        stLoss: Math.round(stLoss * 100) / 100,
        ltLoss: Math.round(ltLoss * 100) / 100,
        candidates: candidates.slice(0, 12),
      };
    } else if (lotRows && lotRows.length > 0) {
      harvest = { taxable: false, totalLoss: 0, stLoss: 0, ltLoss: 0, candidates: [] };
    }
  } catch { /* lots table missing → no harvest section */ }

  return NextResponse.json({ sectors, correlation, factors, holdings: simHoldings, totalValue: Math.round(totalValue), harvest });
}
