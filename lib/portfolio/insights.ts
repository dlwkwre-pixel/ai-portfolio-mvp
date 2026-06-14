export type FinnInsight = {
  id: string;
  title: string;
  body: string;
  type: "concentration" | "diversification" | "cash" | "strategy" | "position";
};

export function detectFinnInsights(params: {
  holdings: Array<{ ticker: string; weight_pct: number; sector?: string | null }>;
  cashPct: number;
  hasStrategy: boolean;
  totalValue: number;
}): FinnInsight[] {
  const { holdings, cashPct, hasStrategy, totalValue } = params;
  const insights: FinnInsight[] = [];

  // Single holding > 30%
  for (const h of holdings) {
    if (h.weight_pct > 30) {
      insights.push({
        id: `concentration-${h.ticker}`,
        title: `${h.ticker} is ${h.weight_pct.toFixed(0)}% of your portfolio`,
        body: `A single position exceeding 30% introduces significant concentration risk. A 20% drawdown in ${h.ticker} alone would drop your portfolio about ${(h.weight_pct * 0.2).toFixed(0)}%.`,
        type: "concentration",
      });
      break;
    }
  }

  // Sector concentration > 60%
  const sectors = holdings.reduce((acc, h) => {
    if (h.sector) acc[h.sector] = (acc[h.sector] ?? 0) + h.weight_pct;
    return acc;
  }, {} as Record<string, number>);

  for (const [sector, pct] of Object.entries(sectors)) {
    if (pct > 60) {
      insights.push({
        id: `sector-${sector}`,
        title: `${pct.toFixed(0)}% of your portfolio is in ${sector}`,
        body: `Heavy sector concentration amplifies downside when that sector rotates out of favor. Consider whether your conviction in ${sector} is thesis-driven or accidental drift.`,
        type: "diversification",
      });
      break;
    }
  }

  // Too much cash
  if (cashPct > 35 && totalValue > 5000) {
    insights.push({
      id: "high-cash",
      title: `${cashPct.toFixed(0)}% of your portfolio is sitting in cash`,
      body: "Long-term cash drag costs meaningful returns over time. If you're waiting for a dip, consider setting a target entry price rather than waiting indefinitely.",
      type: "cash",
    });
  }

  // No dry powder
  if (cashPct < 2 && totalValue > 5000 && insights.length === 0) {
    insights.push({
      id: "low-cash",
      title: "You're nearly fully invested with no dry powder",
      body: "Having less than 2% in cash means you can't act on new opportunities or add to positions during pullbacks without selling something first.",
      type: "cash",
    });
  }

  // No strategy
  if (!hasStrategy && insights.length < 2) {
    insights.push({
      id: "no-strategy",
      title: "This portfolio has no strategy assigned",
      body: "Portfolios without a defined strategy tend to drift. FINN can help you document your thesis, rebalancing rules, and risk tolerance in the Strategies tab.",
      type: "strategy",
    });
  }

  return insights.slice(0, 2);
}
