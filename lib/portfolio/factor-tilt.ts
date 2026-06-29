// Factor / style tilt analysis from free Finnhub fundamentals.
// Classifies each holding on the value↔growth and size axes, then reports
// value-weighted portfolio aggregates. Honest about coverage gaps — funds and
// thinly-covered tickers simply drop out of the denominator rather than skew it.

import type { FinnhubFactorMetrics } from "@/lib/market-data/finnhub";

export type FactorInput = {
  ticker: string;
  value: number; // market value (used as the weight)
  metrics: FinnhubFactorMetrics;
};

export type StyleClass = "value" | "blend" | "growth";
export type SizeClass = "large" | "mid" | "small";

export type FactorTilt = {
  analyzedValue: number; // total value of positions we attempted to classify
  styleCoveragePct: number; // % of analyzed value with a style classification
  sizeCoveragePct: number;
  style: { value: number; blend: number; growth: number }; // % of classified value
  size: { large: number; mid: number; small: number };
  weightedPe: number | null;
  weightedBeta: number | null;
  weightedDividendYield: number | null;
  weightedMomentum: number | null; // 52-week price return %
  headline: string; // one-line plain-English summary
};

function classifyStyle(m: FinnhubFactorMetrics): StyleClass | null {
  const { peRatio, pbRatio, revenueGrowth, epsGrowth } = m;
  // Need at least one usable signal.
  if (peRatio === null && pbRatio === null && revenueGrowth === null && epsGrowth === null) return null;

  const growthSignals =
    (peRatio !== null && peRatio > 28 ? 1 : 0) +
    (revenueGrowth !== null && revenueGrowth > 18 ? 1 : 0) +
    (epsGrowth !== null && epsGrowth > 20 ? 1 : 0);
  const valueSignals =
    (peRatio !== null && peRatio > 0 && peRatio < 16 ? 1 : 0) +
    (pbRatio !== null && pbRatio > 0 && pbRatio < 2 ? 1 : 0);

  if (growthSignals > valueSignals && growthSignals > 0) return "growth";
  if (valueSignals > growthSignals && valueSignals > 0) return "value";
  return "blend";
}

function classifySize(marketCapMillions: number | null): SizeClass | null {
  if (marketCapMillions === null || marketCapMillions <= 0) return null;
  if (marketCapMillions >= 10_000) return "large"; // ≥ $10B
  if (marketCapMillions >= 2_000) return "mid"; // ≥ $2B
  return "small";
}

// Value-weighted mean of a metric over holdings that report it.
function weightedMean(inputs: FactorInput[], pick: (m: FinnhubFactorMetrics) => number | null): number | null {
  let wsum = 0, w = 0;
  for (const it of inputs) {
    const v = pick(it.metrics);
    if (v === null || !Number.isFinite(v)) continue;
    wsum += v * it.value;
    w += it.value;
  }
  return w > 0 ? wsum / w : null;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

export function computeFactorTilt(inputs: FactorInput[]): FactorTilt | null {
  const usable = inputs.filter((i) => i.value > 0 && i.metrics);
  if (usable.length === 0) return null;
  const analyzedValue = usable.reduce((s, i) => s + i.value, 0);
  if (analyzedValue <= 0) return null;

  // Style distribution (value-weighted over classified holdings).
  const styleAcc = { value: 0, blend: 0, growth: 0 };
  let styleClassified = 0;
  for (const it of usable) {
    const c = classifyStyle(it.metrics);
    if (!c) continue;
    styleAcc[c] += it.value;
    styleClassified += it.value;
  }
  const style = styleClassified > 0
    ? {
        value: Math.round((styleAcc.value / styleClassified) * 100),
        blend: Math.round((styleAcc.blend / styleClassified) * 100),
        growth: Math.round((styleAcc.growth / styleClassified) * 100),
      }
    : { value: 0, blend: 0, growth: 0 };

  // Size distribution.
  const sizeAcc = { large: 0, mid: 0, small: 0 };
  let sizeClassified = 0;
  for (const it of usable) {
    const c = classifySize(it.metrics.marketCap);
    if (!c) continue;
    sizeAcc[c] += it.value;
    sizeClassified += it.value;
  }
  const size = sizeClassified > 0
    ? {
        large: Math.round((sizeAcc.large / sizeClassified) * 100),
        mid: Math.round((sizeAcc.mid / sizeClassified) * 100),
        small: Math.round((sizeAcc.small / sizeClassified) * 100),
      }
    : { large: 0, mid: 0, small: 0 };

  const weightedPe = weightedMean(usable, (m) => (m.peRatio !== null && m.peRatio > 0 ? m.peRatio : null));
  const weightedBeta = weightedMean(usable, (m) => m.beta);
  const weightedDividendYield = weightedMean(usable, (m) => m.dividendYield);
  const weightedMomentum = weightedMean(usable, (m) => m.priceReturn52w);

  // Plain-English headline.
  const sizeWord = size.large >= 50 ? "large-cap" : size.small >= 40 ? "small-cap" : size.mid >= 40 ? "mid-cap" : "mixed-cap";
  const styleWord = style.growth >= 50 ? "growth" : style.value >= 50 ? "value" : "blend";
  let volWord = "";
  if (weightedBeta !== null) {
    volWord = weightedBeta > 1.15 ? `, above-market volatility (β ${round1(weightedBeta)})`
      : weightedBeta < 0.85 ? `, defensive (β ${round1(weightedBeta)})`
      : `, market-like volatility (β ${round1(weightedBeta)})`;
  }
  const headline = `${sizeWord} ${styleWord} tilt${volWord}`;

  return {
    analyzedValue: Math.round(analyzedValue),
    styleCoveragePct: Math.round((styleClassified / analyzedValue) * 100),
    sizeCoveragePct: Math.round((sizeClassified / analyzedValue) * 100),
    style,
    size,
    weightedPe: weightedPe !== null ? round1(weightedPe) : null,
    weightedBeta: weightedBeta !== null ? round1(weightedBeta) : null,
    weightedDividendYield: weightedDividendYield !== null ? round1(weightedDividendYield) : null,
    weightedMomentum: weightedMomentum !== null ? round1(weightedMomentum) : null,
    headline,
  };
}
