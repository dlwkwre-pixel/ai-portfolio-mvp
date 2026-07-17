import type { ValuedHolding } from "@/lib/portfolio/valuation";
import InfoTooltip from "@/app/components/info-tooltip";
import {
  type RawLot, buildOpenLots, planTaxAwareTrim, estimateTrimTax,
  accountIsTaxable, DEFAULT_LT_RATE, DEFAULT_ST_RATE,
} from "@/lib/portfolio/tax-lots";

type StrategyConstraints = {
  max_position_pct: number | null;
  min_position_pct: number | null;
  cash_min_pct: number | null;
  cash_max_pct: number | null;
};

type Props = {
  valuedHoldings: ValuedHolding[];
  totalValue: number;
  cashBalance: number;
  strategyConstraints: StrategyConstraints | null;
  strategyName: string | null;
  lots?: RawLot[];
  accountType?: string | null;
};

type PositionStatus = "over" | "under" | "ok" | "no-price";

type TrimTax = {
  gain: number;
  longTermGain: number;
  shortTermGain: number;
  tax: number;
  hasShortTermGain: boolean;
  coversTarget: boolean;
};

function formatMoney(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function signedMoney(v: number) {
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function RebalancingCalculator({
  valuedHoldings,
  totalValue,
  cashBalance,
  strategyConstraints,
  strategyName,
  lots = [],
  accountType = null,
}: Props) {
  if (!valuedHoldings.length || totalValue <= 0) return null;

  const isTaxable = accountIsTaxable(accountType);
  const hasLots = lots.length > 0;
  const ltRatePct = Math.round(DEFAULT_LT_RATE * 100);
  const stRatePct = Math.round(DEFAULT_ST_RATE * 100);

  // Tax-optimal trim plan per ticker (only meaningful for taxable accounts with lots).
  const trimTaxByTicker: Record<string, TrimTax> = {};
  function computeTrimTax(ticker: string, currentPrice: number, dollarTarget: number): TrimTax | null {
    if (!isTaxable || !hasLots || currentPrice <= 0 || dollarTarget <= 0) return null;
    const tickerLots = lots.filter((l) => l.ticker?.toUpperCase() === ticker.toUpperCase());
    if (!tickerLots.length) return null;
    const open = buildOpenLots(tickerLots);
    if (!open.length) return null;
    const plan = planTaxAwareTrim(open, currentPrice, dollarTarget);
    if (plan.sharesToSell <= 0) return null;
    return {
      gain: plan.gain,
      longTermGain: plan.longTermGain,
      shortTermGain: plan.shortTermGain,
      tax: estimateTrimTax(plan),
      hasShortTermGain: plan.hasShortTermGain,
      coversTarget: plan.coversTarget,
    };
  }

  const maxPct = strategyConstraints?.max_position_pct ?? null;
  const minPct = strategyConstraints?.min_position_pct ?? null;
  const cashMinPct = strategyConstraints?.cash_min_pct ?? null;
  const cashMaxPct = strategyConstraints?.cash_max_pct ?? null;

  const cashPct = (cashBalance / totalValue) * 100;

  type Row = {
    ticker: string;
    name: string | null;
    currentPct: number;
    currentValue: number;
    status: PositionStatus;
    deltaLabel: string | null;
    deltaValue: number | null;
    trimTo: number | null;
    buildTo: number | null;
  };

  const rows: Row[] = valuedHoldings.map((h) => {
    const currentPct = h.weight_pct ?? 0;
    const currentValue = h.market_value ?? 0;

    if (!h.has_live_price || h.current_price === null) {
      return { ticker: h.ticker, name: h.company_name, currentPct, currentValue, status: "no-price" as const, deltaLabel: null, deltaValue: null, trimTo: null, buildTo: null };
    }

    let status: PositionStatus = "ok";
    let deltaLabel: string | null = null;
    let deltaValue: number | null = null;
    let trimTo: number | null = null;
    let buildTo: number | null = null;

    if (maxPct !== null && currentPct > maxPct) {
      status = "over";
      const targetValue = (maxPct / 100) * totalValue;
      deltaValue = currentValue - targetValue;
      deltaLabel = `Trim ${formatMoney(deltaValue)}`;
      trimTo = maxPct;
      const tt = computeTrimTax(h.ticker, h.current_price, deltaValue);
      if (tt) trimTaxByTicker[h.ticker] = tt;
    } else if (minPct !== null && currentPct < minPct) {
      status = "under";
      const targetValue = (minPct / 100) * totalValue;
      deltaValue = targetValue - currentValue;
      deltaLabel = `Add ${formatMoney(deltaValue)}`;
      buildTo = minPct;
    }

    return { ticker: h.ticker, name: h.company_name, currentPct, currentValue, status, deltaLabel, deltaValue, trimTo, buildTo };
  });

  const overCount = rows.filter((r) => r.status === "over").length;
  const underCount = rows.filter((r) => r.status === "under").length;
  const hasIssues = overCount > 0 || underCount > 0;

  // Aggregate tax impact of trimming every over-weight position the tax-smart way.
  const trimPlans = Object.values(trimTaxByTicker);
  const totalTrimGain = trimPlans.reduce((s, t) => s + t.gain, 0);
  const totalTrimTax = trimPlans.reduce((s, t) => s + t.tax, 0);
  const showTaxSummary = isTaxable && hasLots && overCount > 0 && trimPlans.length > 0;

  // Cash status
  let cashStatus: PositionStatus = "ok";
  let cashDeltaLabel: string | null = null;
  if (cashMaxPct !== null && cashPct > cashMaxPct) {
    cashStatus = "over";
    const excess = cashBalance - (cashMaxPct / 100) * totalValue;
    cashDeltaLabel = `Deploy ${formatMoney(excess)}`;
  } else if (cashMinPct !== null && cashPct < cashMinPct) {
    cashStatus = "under";
    const needed = (cashMinPct / 100) * totalValue - cashBalance;
    cashDeltaLabel = `Raise ${formatMoney(needed)} cash`;
  }

  const statusColor = {
    over: "#f59e0b",
    under: "#60a5fa",
    ok: "#00d395",
    "no-price": "var(--text-muted)",
  };

  const statusBg = {
    over: "rgba(245,158,11,0.06)",
    under: "rgba(96,165,250,0.06)",
    ok: "rgba(0,211,149,0.04)",
    "no-price": "rgba(255,255,255,0.02)",
  };

  const statusBorder = {
    over: "rgba(245,158,11,0.2)",
    under: "rgba(96,165,250,0.2)",
    ok: "rgba(0,211,149,0.12)",
    "no-price": "var(--border-subtle)",
  };

  return (
    <div className="bt-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="#60a5fa">
            <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
          </svg>
          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Rebalancing</h2>
        </div>
        {strategyName && (
          <span style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {strategyName}
          </span>
        )}
      </div>

      {!strategyConstraints || (maxPct === null && minPct === null && cashMinPct === null && cashMaxPct === null) ? (
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          Assign a strategy with position size limits to see rebalancing suggestions.
        </p>
      ) : (
        <>
          {/* Summary bar */}
          <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap" }}>
            {hasIssues ? (
              <>
                {overCount > 0 && (
                  <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}>
                    {overCount} over-weight
                  </span>
                )}
                {underCount > 0 && (
                  <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa" }}>
                    {underCount} under-weight
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "rgba(0,211,149,0.08)", border: "1px solid rgba(0,211,149,0.2)", color: "var(--green)" }}>
                All positions within bounds
              </span>
            )}
            {maxPct !== null && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                max {maxPct}% per position
              </span>
            )}
            {minPct !== null && (
              <span style={{ fontSize: "10px", color: "var(--text-muted)", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                min {minPct}%
              </span>
            )}
          </div>

          {/* Position rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {rows.map((row) => {
              const tt = trimTaxByTicker[row.ticker];
              return (
              <div
                key={row.ticker}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: tt ? "6px" : 0,
                  padding: "7px 10px",
                  background: statusBg[row.status],
                  border: `1px solid ${statusBorder[row.status]}`,
                  borderRadius: "var(--radius-md)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {/* Status dot */}
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: statusColor[row.status], flexShrink: 0 }} />

                {/* Ticker */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-primary)", minWidth: "44px" }}>
                  {row.ticker}
                </span>

                {/* Allocation bar */}
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                  <div style={{ flex: 1, height: "3px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden", position: "relative" }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${Math.min(row.currentPct, 100)}%`,
                      background: statusColor[row.status],
                      borderRadius: "2px",
                      transition: "width 0.3s ease",
                    }} />
                    {maxPct !== null && (
                      <div style={{
                        position: "absolute", top: "-1px", bottom: "-1px",
                        left: `${Math.min(maxPct, 100)}%`,
                        width: "1px", background: "rgba(245,158,11,0.5)",
                      }} />
                    )}
                  </div>
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: statusColor[row.status], minWidth: "32px", textAlign: "right" }}>
                    {row.currentPct.toFixed(1)}%
                  </span>
                </div>

                {/* Action hint */}
                {row.deltaLabel && (
                  <span style={{ fontSize: "10px", color: statusColor[row.status], fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                    {row.deltaLabel}
                  </span>
                )}
                </div>

                {/* Tax-aware trim detail (taxable accounts with lot history) */}
                {tt && (
                  <div style={{
                    display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px",
                    paddingLeft: "13px", paddingTop: "2px", borderTop: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Tax-smart trim
                    </span>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: tt.gain >= 0 ? "#f59e0b" : "#00d395" }}>
                      {tt.gain >= 0 ? `+${signedMoney(tt.gain)} gain` : `${signedMoney(tt.gain)} loss harvested`}
                    </span>
                    <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
                      est. tax {formatMoney(tt.tax)}
                    </span>
                    <InfoTooltip
                      width={250}
                      align="end"
                      text={`To trim ${row.ticker}, sell tax-optimal lots first: harvest losses, then long-term gains (lowest gain first), then short-term last. ${tt.longTermGain !== 0 ? `Long-term ${signedMoney(tt.longTermGain)}. ` : ""}${tt.shortTermGain !== 0 ? `Short-term ${signedMoney(tt.shortTermGain)}. ` : ""}${tt.hasShortTermGain ? "Holding the short-term lots past 1 year would lower the rate. " : ""}Tax est. assumes ${ltRatePct}% long-term / ${stRatePct}% short-term — see the Tax Center for your actual brackets.`}
                    >
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: "13px", height: "13px", borderRadius: "50%", cursor: "help",
                        fontSize: "10px", fontWeight: 700, color: "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                      }}>i</span>
                    </InfoTooltip>
                    {tt.hasShortTermGain && (
                      <span style={{ fontSize: "10px", color: "#f59e0b", fontWeight: 600 }}>
                        ⚠ includes short-term
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
            })}

            {/* Cash row */}
            {(cashMinPct !== null || cashMaxPct !== null) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "7px 10px",
                  background: statusBg[cashStatus],
                  border: `1px solid ${statusBorder[cashStatus]}`,
                  borderRadius: "var(--radius-md)",
                  marginTop: "2px",
                }}
              >
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: statusColor[cashStatus], flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-primary)", minWidth: "44px" }}>
                  CASH
                </span>
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                  <div style={{ flex: 1, height: "3px", background: "var(--bg-elevated)", borderRadius: "2px", overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(cashPct, 100)}%`, height: "100%", background: statusColor[cashStatus], borderRadius: "2px" }} />
                  </div>
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: statusColor[cashStatus], minWidth: "32px", textAlign: "right" }}>
                    {cashPct.toFixed(1)}%
                  </span>
                </div>
                {cashDeltaLabel && (
                  <span style={{ fontSize: "10px", color: statusColor[cashStatus], fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                    {cashDeltaLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Aggregate tax impact of rebalancing */}
          {showTaxSummary && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
              marginTop: "10px", padding: "9px 11px", borderRadius: "var(--radius-md)",
              background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.15)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  Trimming the tax-smart way realizes{" "}
                  <strong style={{ color: totalTrimGain >= 0 ? "var(--text-primary)" : "#00d395", fontFamily: "var(--font-mono)" }}>
                    {signedMoney(totalTrimGain)}
                  </strong>{" "}
                  {totalTrimGain >= 0 ? "in gains" : "in harvested losses"}
                </span>
                <InfoTooltip
                  width={240}
                  align="start"
                  text={`Across all over-weight positions, this picks the lots that minimize tax: losses first, then long-term gains, then short-term. Estimated tax assumes ${ltRatePct}% long-term / ${stRatePct}% short-term. Open the Tax Center to model this against your real brackets and harvesting headroom.`}
                >
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: "14px", height: "14px", borderRadius: "50%", cursor: "help",
                    fontSize: "10px", fontWeight: 700, color: "var(--text-muted)",
                    border: "1px solid var(--border-subtle)", flexShrink: 0,
                  }}>i</span>
                </InfoTooltip>
              </div>
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", flexShrink: 0 }}>
                est. tax {formatMoney(totalTrimTax)}
              </span>
            </div>
          )}

          {/* Tax-advantaged accounts: no capital-gains drag */}
          {!isTaxable && accountType && overCount > 0 && (
            <p style={{ fontSize: "10px", color: "var(--green)", marginTop: "10px", display: "flex", alignItems: "center", gap: "5px" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#00d395" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              Tax-advantaged account — rebalance freely, sells don&apos;t trigger capital-gains tax.
            </p>
          )}

          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
            {isTaxable && hasLots
              ? "Lot-level tax estimates use your recorded purchase history. Run AI analysis for trade-specific recommendations."
              : "Based on strategy position constraints. Run AI analysis for trade-specific recommendations."}
          </p>
        </>
      )}
    </div>
  );
}
