import type { ValuedHolding } from "@/lib/portfolio/valuation";

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
};

type PositionStatus = "over" | "under" | "ok" | "no-price";

function formatMoney(v: number) {
  return `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function RebalancingCalculator({
  valuedHoldings,
  totalValue,
  cashBalance,
  strategyConstraints,
  strategyName,
}: Props) {
  if (!valuedHoldings.length || totalValue <= 0) return null;

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
              <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "rgba(0,211,149,0.08)", border: "1px solid rgba(0,211,149,0.2)", color: "#00d395" }}>
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
            {rows.map((row) => (
              <div
                key={row.ticker}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "7px 10px",
                  background: statusBg[row.status],
                  border: `1px solid ${statusBorder[row.status]}`,
                  borderRadius: "var(--radius-md)",
                }}
              >
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
            ))}

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

          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
            Based on strategy position constraints. Run AI analysis for trade-specific recommendations.
          </p>
        </>
      )}
    </div>
  );
}
