import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { getCryptoPrices } from "@/lib/market-data/coingecko";
import { getFmpQuotes } from "@/lib/market-data/fmp";
import type { CryptoQuote } from "@/lib/market-data/coingecko";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type HoldingRow = {
  id: string;
  ticker: string;
  company_name: string | null;
  asset_type: string | null;
  shares: number | string | null;
  average_cost_basis: number | string | null;
  // Non-tradeable / advisor funds (asset_type = "manual"): user-entered NAV, no live feed.
  manual_price?: number | string | null;
  manual_price_updated_at?: string | null;
};

export type ValuedHolding = HoldingRow & {
  shares_number: number;
  average_cost_basis_number: number;
  current_price: number | null;
  market_value: number | null;
  cost_basis_total: number;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
  day_change: number | null;
  day_change_pct: number | null;
  weight_pct: number | null;
  has_live_price: boolean;
};

export type PortfolioValuation = {
  holdings_value: number;
  cash_balance: number;
  total_portfolio_value: number;
  valued_holdings: ValuedHolding[];
};

export async function getPortfolioValuation(args: {
  holdings: HoldingRow[];
  cashBalance: number;
}): Promise<PortfolioValuation> {
  const { holdings, cashBalance } = args;

  // Separate crypto and non-tradeable ("manual") holdings from live-quoted stock/ETF holdings.
  // Manual holdings have no public price feed, so they skip the Finnhub/CoinGecko batches
  // entirely and are valued at shares * user-entered NAV (manual_price).
  const cryptoHoldings = holdings.filter((h) => h.asset_type === "crypto");
  const stockHoldings = holdings.filter(
    (h) => h.asset_type !== "crypto" && h.asset_type !== "manual"
  );

  // Fetch crypto prices from CoinGecko (single batched call, non-fatal on failure)
  const cryptoTickers = cryptoHoldings.map((h) => h.ticker);
  const cryptoPriceMap: Map<string, CryptoQuote> =
    cryptoTickers.length > 0
      ? await getCryptoPrices(cryptoTickers)
      : new Map();

  // Batch Finnhub calls to avoid hitting the free-tier rate limit (60 req/min).
  // Promise.all on large portfolios fires everything at once and gets 429s back.
  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 300;
  const quoteResults: { holdingId: string; quote: Awaited<ReturnType<typeof getFinnhubQuote>> }[] = [];

  for (let i = 0; i < stockHoldings.length; i += BATCH_SIZE) {
    const batch = stockHoldings.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (holding) => {
        try {
          const quote = await getFinnhubQuote(holding.ticker);
          return { holdingId: holding.id, quote };
        } catch (error) {
          console.error(`Quote fetch failed for ${holding.ticker}:`, error);
          return { holdingId: holding.id, quote: null };
        }
      })
    );
    quoteResults.push(...batchResults);
    if (i + BATCH_SIZE < stockHoldings.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const quoteMap = new Map<string, Awaited<(typeof quoteResults)[number]>["quote"]>();
  for (const result of quoteResults) {
    quoteMap.set(result.holdingId, result.quote);
  }

  // FMP fallback: collect any stock holdings where Finnhub returned null OR an unusable price
  // (after-hours/illiquid, Finnhub can return c=0 AND pc=0), and retry those in one batch.
  const nullHoldings = stockHoldings.filter((h) => {
    const q = quoteMap.get(h.id);
    return q == null || (!((q.c ?? 0) > 0) && !((q.pc ?? 0) > 0));
  });
  if (nullHoldings.length > 0) {
    const fmpMap = await getFmpQuotes(nullHoldings.map((h) => h.ticker));
    for (const holding of nullHoldings) {
      const fmp = fmpMap.get(holding.ticker.toUpperCase());
      if (fmp) {
        quoteMap.set(holding.id, {
          c: fmp.price,
          d: fmp.change,
          dp: fmp.changesPercentage,
          h: 0,
          l: 0,
          o: 0,
          pc: 0,
          t: 0,
        });
      }
    }
  }

  const prelimValuedHoldings: ValuedHolding[] = holdings.map((holding) => {
    const sharesNumber = Number(holding.shares ?? 0);
    const averageCostBasisNumber = Number(holding.average_cost_basis ?? 0);

    let currentPrice: number | null = null;
    let dayChange: number | null = null;
    let dayChangePct: number | null = null;

    if (holding.asset_type === "crypto") {
      // Use CoinGecko price for crypto holdings
      const cryptoQuote = cryptoPriceMap.get(holding.ticker.toUpperCase());
      currentPrice = cryptoQuote?.priceUsd ?? null;
      dayChangePct = cryptoQuote?.change24hPct ?? null;
      // day_change in dollar terms: price * change% / 100
      dayChange =
        currentPrice !== null && dayChangePct !== null
          ? (currentPrice * dayChangePct) / 100
          : null;
    } else if (holding.asset_type === "manual") {
      // Non-tradeable fund: value at the user-entered NAV. No live feed, so no day change.
      const navRaw = holding.manual_price != null ? Number(holding.manual_price) : null;
      currentPrice = navRaw !== null && Number.isFinite(navRaw) ? navRaw : null;
      dayChange = null;
      dayChangePct = null;
    } else {
      // Use Finnhub for stocks/ETFs. After-hours or for illiquid names the current price (c)
      // can come back 0 — fall back to the previous close (pc) so market values and the AI
      // analysis use a real price instead of $0 (which produced "buy 0 shares at $0.01").
      const quote = quoteMap.get(holding.id) ?? null;
      if (quote && (quote.c ?? 0) > 0) {
        currentPrice = quote.c;
        dayChange = quote.d ?? null;
        dayChangePct = quote.dp ?? null;
      } else if (quote && (quote.pc ?? 0) > 0) {
        currentPrice = quote.pc;       // previous close — markets closed, no intraday move
        dayChange = 0;
        dayChangePct = 0;
      } else {
        currentPrice = null;
      }
    }

    const marketValue = currentPrice !== null ? sharesNumber * currentPrice : null;
    const costBasisTotal = sharesNumber * averageCostBasisNumber;
    const unrealizedPL =
      marketValue !== null ? marketValue - costBasisTotal : null;
    const unrealizedPLPct =
      unrealizedPL !== null && costBasisTotal > 0
        ? (unrealizedPL / costBasisTotal) * 100
        : null;

    return {
      ...holding,
      shares_number: sharesNumber,
      average_cost_basis_number: averageCostBasisNumber,
      current_price: currentPrice,
      market_value: marketValue,
      cost_basis_total: costBasisTotal,
      unrealized_pl: unrealizedPL,
      unrealized_pl_pct: unrealizedPLPct,
      day_change: dayChange,
      day_change_pct: dayChangePct,
      weight_pct: null,
      // Manual NAVs contribute to market value but are not a live market price.
      has_live_price: holding.asset_type === "manual" ? false : currentPrice !== null,
    };
  });

  const holdingsValue = prelimValuedHoldings.reduce((sum, holding) => {
    return sum + (holding.market_value ?? 0);
  }, 0);

  const totalPortfolioValue = holdingsValue + cashBalance;

  const valuedHoldings = prelimValuedHoldings.map((holding) => ({
    ...holding,
    weight_pct:
      totalPortfolioValue > 0 && holding.market_value !== null
        ? (holding.market_value / totalPortfolioValue) * 100
        : null,
  }));

  return {
    holdings_value: holdingsValue,
    cash_balance: cashBalance,
    total_portfolio_value: totalPortfolioValue,
    valued_holdings: valuedHoldings,
  };
}