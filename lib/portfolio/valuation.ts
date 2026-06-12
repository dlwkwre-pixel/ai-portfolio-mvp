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

  // Separate crypto holdings from stock/ETF holdings
  const cryptoHoldings = holdings.filter((h) => h.asset_type === "crypto");
  const stockHoldings = holdings.filter((h) => h.asset_type !== "crypto");

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

  // FMP fallback: collect any stock holdings where Finnhub returned null and retry in one batch
  const nullHoldings = stockHoldings.filter((h) => quoteMap.get(h.id) == null);
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
    } else {
      // Use Finnhub for stocks/ETFs
      const quote = quoteMap.get(holding.id) ?? null;
      currentPrice = quote?.c ?? null;
      dayChange = quote?.d ?? null;
      dayChangePct = quote?.dp ?? null;
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
      has_live_price: currentPrice !== null,
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