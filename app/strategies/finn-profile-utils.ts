import type { StrategyCard } from "./types";

export type InsightSignal = "tax" | "volatility" | "time" | "concentration" | "cash" | "style";

export type MemoryInsight = {
  label: string;
  detail: string;
  signal: InsightSignal;
};

export function deriveMemoryInsights(cards: StrategyCard[]): MemoryInsight[] {
  if (cards.length < 2) return [];

  const insights: MemoryInsight[] = [];
  const versions = cards.map(c => c.latest_version).filter(Boolean);
  const n = versions.length;
  if (n === 0) return [];
  const threshold = Math.max(2, Math.ceil(n * 0.55));

  const lowTurnover = versions.filter(v => v?.turnover_preference === "Low").length;
  if (lowTurnover >= threshold) {
    insights.push({
      label: "Consistently prioritizes low turnover",
      detail: `${lowTurnover} of ${n} strategies use low-turnover positioning — tax deferral appears to be a standing priority.`,
      signal: "tax",
    });
  } else {
    const highTurnover = versions.filter(v => v?.turnover_preference === "High").length;
    if (highTurnover >= threshold) {
      insights.push({
        label: "Active trading preference",
        detail: `${highTurnover} of ${n} strategies favour high turnover — consistent preference for tactical positioning over tax efficiency.`,
        signal: "tax",
      });
    }
  }

  const longTerm = versions.filter(v =>
    v?.holding_period_bias === "Long-term" || v?.holding_period_bias === "Very Long-term"
  ).length;
  if (longTerm >= threshold) {
    insights.push({
      label: "Long-term holding bias",
      detail: `${longTerm} of ${n} strategies emphasise long or very long-term holding — patient capital orientation.`,
      signal: "time",
    });
  } else {
    const shortTerm = versions.filter(v =>
      v?.holding_period_bias === "Short-term" || v?.holding_period_bias === "Swing"
    ).length;
    if (shortTerm >= threshold) {
      insights.push({
        label: "Short-term / tactical horizon",
        detail: `${shortTerm} of ${n} strategies use short or swing-term horizons — consistent preference for active cycle timing.`,
        signal: "time",
      });
    }
  }

  const conservative = cards.filter(c => c.risk_level === "Conservative").length;
  const aggressive = cards.filter(c => c.risk_level === "Aggressive").length;
  const riskThreshold = Math.max(2, Math.ceil(cards.length * 0.55));
  if (conservative >= riskThreshold) {
    insights.push({
      label: "Systematically risk-averse",
      detail: `${conservative} of ${cards.length} strategies are conservative — capital preservation appears to be a core constraint.`,
      signal: "volatility",
    });
  } else if (aggressive >= riskThreshold) {
    insights.push({
      label: "Consistently high conviction",
      detail: `${aggressive} of ${cards.length} strategies carry aggressive risk — strong directional views expressed repeatedly.`,
      signal: "volatility",
    });
  }

  const posVersions = versions.filter(v => v?.max_position_pct != null);
  if (posVersions.length >= 2) {
    const concentrated = posVersions.filter(v => (v?.max_position_pct ?? 0) >= 20).length;
    const diversified   = posVersions.filter(v => (v?.max_position_pct ?? 100) <= 8).length;
    const posThreshold  = Math.max(2, Math.ceil(posVersions.length * 0.55));
    if (concentrated >= posThreshold) {
      insights.push({
        label: "Preference for concentrated positions",
        detail: `${concentrated} strategies allow max positions ≥20% — consistent high-conviction, low-diversification approach.`,
        signal: "concentration",
      });
    } else if (diversified >= posThreshold) {
      insights.push({
        label: "Diversification-first approach",
        detail: `${diversified} strategies cap single positions at ≤8% — systematic preference for broad exposure over concentration.`,
        signal: "concentration",
      });
    }
  }

  const cashVersions = versions.filter(v => v?.cash_min_pct != null);
  if (cashVersions.length >= 2) {
    const cashHeavy = cashVersions.filter(v => (v?.cash_min_pct ?? 0) >= 10).length;
    if (cashHeavy >= Math.max(2, Math.ceil(cashVersions.length * 0.55))) {
      insights.push({
        label: "Values cash optionality",
        detail: `${cashHeavy} strategies maintain ≥10% cash floors — consistent preference for dry powder and deployment flexibility.`,
        signal: "cash",
      });
    }
  }

  return insights.slice(0, 4);
}
