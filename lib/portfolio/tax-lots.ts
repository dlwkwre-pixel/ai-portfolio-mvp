// Tax-aware lot accounting for the rebalancing assistant.
// Reconstructs remaining open lots from BUY/DRIP/SELL history, then picks the
// shares to sell that minimize realized tax when a position must be trimmed.

export type RawLot = {
  ticker: string;
  lot_type: "BUY" | "SELL" | "DRIP";
  purchased_at: string;
  shares: number | string;
  price_per_share: number | string;
};

export type OpenLot = {
  shares: number;
  costPerShare: number;
  purchasedAt: string;
  longTerm: boolean;
};

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const EPS = 1e-9;

// Account types that incur capital-gains tax on a sale.
const TAXABLE_ACCOUNTS = new Set(["taxable", "brokerage", "speculative", "margin"]);

export function accountIsTaxable(accountType: string | null | undefined): boolean {
  if (!accountType) return false;
  return TAXABLE_ACCOUNTS.has(accountType.toLowerCase());
}

// Remaining open lots for ONE ticker, consuming SELL shares against the oldest
// BUY/DRIP lots first (FIFO — the IRS default when no other method is elected).
export function buildOpenLots(lots: RawLot[], asOf: Date = new Date()): OpenLot[] {
  const buys = lots
    .filter((l) => l.lot_type !== "SELL")
    .map((l) => ({
      shares: Number(l.shares),
      costPerShare: Number(l.price_per_share),
      purchasedAt: l.purchased_at,
    }))
    .filter((b) => Number.isFinite(b.shares) && b.shares > 0 && Number.isFinite(b.costPerShare))
    .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));

  let sellShares = lots
    .filter((l) => l.lot_type === "SELL")
    .reduce((s, l) => s + (Number(l.shares) || 0), 0);

  const asOfMs = asOf.getTime();
  const open: OpenLot[] = [];
  for (const b of buys) {
    let remaining = b.shares;
    if (sellShares > 0) {
      const consumed = Math.min(remaining, sellShares);
      remaining -= consumed;
      sellShares -= consumed;
    }
    if (remaining > EPS) {
      open.push({
        shares: remaining,
        costPerShare: b.costPerShare,
        purchasedAt: b.purchasedAt,
        longTerm: asOfMs - new Date(b.purchasedAt).getTime() >= YEAR_MS,
      });
    }
  }
  return open;
}

export type TrimPlan = {
  sharesToSell: number;
  proceeds: number;
  costBasis: number;
  gain: number; // total realized gain (can be negative)
  longTermGain: number;
  shortTermGain: number;
  coversTarget: boolean; // open lots were enough to raise the dollar target
  lotCount: number;
  hasShortTermGain: boolean;
};

// Pick shares to raise ~dollarTarget in proceeds while minimizing tax.
// Priority: harvest losses first (biggest loss/share), then long-term gains
// (highest cost basis first → smallest gain), then short-term gains (HIFO).
export function planTaxAwareTrim(
  openLots: OpenLot[],
  currentPrice: number,
  dollarTarget: number,
): TrimPlan {
  const empty: TrimPlan = {
    sharesToSell: 0, proceeds: 0, costBasis: 0, gain: 0,
    longTermGain: 0, shortTermGain: 0, coversTarget: false, lotCount: 0, hasShortTermGain: false,
  };
  if (!openLots.length || currentPrice <= 0 || dollarTarget <= 0) return empty;

  const lots = openLots.map((l) => ({ ...l, gainPerShare: currentPrice - l.costPerShare }));
  const losses = lots.filter((l) => l.gainPerShare < 0).sort((a, b) => a.gainPerShare - b.gainPerShare);
  const ltGains = lots.filter((l) => l.gainPerShare >= 0 && l.longTerm).sort((a, b) => b.costPerShare - a.costPerShare);
  const stGains = lots.filter((l) => l.gainPerShare >= 0 && !l.longTerm).sort((a, b) => b.costPerShare - a.costPerShare);
  const ordered = [...losses, ...ltGains, ...stGains];

  let need = dollarTarget;
  let sharesToSell = 0, proceeds = 0, costBasis = 0, longTermGain = 0, shortTermGain = 0, lotCount = 0;
  let hasShortTermGain = false;

  for (const lot of ordered) {
    if (need <= EPS) break;
    const sharesNeeded = need / currentPrice;
    const take = Math.min(lot.shares, sharesNeeded);
    if (take <= EPS) continue;

    const lotProceeds = take * currentPrice;
    const lotGain = lotProceeds - take * lot.costPerShare;
    sharesToSell += take;
    proceeds += lotProceeds;
    costBasis += take * lot.costPerShare;
    if (lot.longTerm) longTermGain += lotGain;
    else { shortTermGain += lotGain; if (lotGain > 0) hasShortTermGain = true; }
    need -= lotProceeds;
    lotCount++;
  }

  return {
    sharesToSell, proceeds, costBasis,
    gain: longTermGain + shortTermGain,
    longTermGain, shortTermGain,
    coversTarget: need <= dollarTarget * 0.005,
    lotCount, hasShortTermGain,
  };
}

// Illustrative federal default rates. The Tax Center has the user's real brackets.
export const DEFAULT_LT_RATE = 0.15;
export const DEFAULT_ST_RATE = 0.24;

// Estimated tax owed on a trim. Losses net within their own holding-period bucket;
// the result is floored at 0 (a net loss has no tax owed, it carries forward instead).
export function estimateTrimTax(plan: TrimPlan, ltRate = DEFAULT_LT_RATE, stRate = DEFAULT_ST_RATE): number {
  const lt = plan.longTermGain * ltRate;
  const st = plan.shortTermGain * stRate;
  return Math.max(0, lt + st);
}
