import { getFinnhubQuote } from "@/lib/market-data/finnhub";

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

  const quoteResults = await Promise.all(
    holdings.map(async (holding) => {
      try {
        const quote = await getFinnhubQuote(holding.ticker);
        return { holdingId: holding.id, quote };
      } catch (error) {
        console.error(`Quote fetch failed for ${holding.ticker}:`, error);
        return { holdingId: holding.id, quote: null };
      }
    })
  );

  const quoteMap = new Map<string, Awaited<(typeof quoteResults)[number]>["quote"]>();
  for (const result of quoteResults) {
    quoteMap.set(result.holdingId, result.quote);
  }

  const prelimValuedHoldings: ValuedHolding[] = holdings.map((holding) => {
    const sharesNumber = Number(holding.shares ?? 0);
    const averageCostBasisNumber = Number(holding.average_cost_basis ?? 0);
    const quote = quoteMap.get(holding.id) ?? null;

    const currentPrice = quote?.c ?? null;
    const hasLivePrice = currentPrice !== null;

    const marketValue = hasLivePrice ? sharesNumber * currentPrice : null;
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
      day_change: quote?.d ?? null,
      day_change_pct: quote?.dp ?? null,
      weight_pct: null,
      has_live_price: hasLivePrice,
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