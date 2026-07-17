import { computeRecommendationScorecard, type Verdict } from "@/lib/portfolio/recommendation-scorecard";

type Props = {
  portfolioId: string;
};

function formatPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default async function RecommendationOutcomesSection({ portfolioId }: Props) {
  const sc = await computeRecommendationScorecard(portfolioId);

  if (sc.executedCount === 0) {
    return (
      <div style={{ background: "var(--surface-002)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="#00d395">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>AI Recommendation Outcomes</h2>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          No executed recommendations yet. Once you execute AI suggestions, their performance will appear here.
        </p>
      </div>
    );
  }

  const rows = sc.rows;
  const accuracyRate = sc.accuracyRate;
  const executedCount = sc.executedCount;

  const verdictColor: Record<Verdict, string> = {
    correct: "#00d395",
    incorrect: "#f87171",
    pending: "#60a5fa",
    "no-data": "var(--text-muted)",
  };

  const verdictDotTitle: Record<Verdict, string> = {
    correct: "Correct",
    incorrect: "Off target",
    pending: "Pending",
    "no-data": "—",
  };

  const actionBg: Record<string, string> = {
    buy: "rgba(0,211,149,0.08)", add: "rgba(0,211,149,0.08)",
    sell: "rgba(248,113,113,0.08)", trim: "rgba(248,113,113,0.08)",
    hold: "rgba(96,165,250,0.08)", watch: "rgba(167,139,250,0.08)",
  };
  const actionColor: Record<string, string> = {
    buy: "#00d395", add: "#00d395",
    sell: "#f87171", trim: "#f87171",
    hold: "#60a5fa", watch: "#a78bfa",
  };

  return (
    <div style={{ background: "rgba(0,211,149,0.02)", border: "1px solid rgba(0,211,149,0.1)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="#00d395">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>AI Recommendation Outcomes</h2>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {accuracyRate !== null && (
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: accuracyRate >= 50 ? "rgba(0,211,149,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${accuracyRate >= 50 ? "rgba(0,211,149,0.25)" : "rgba(248,113,113,0.25)"}`, color: accuracyRate >= 50 ? "var(--green)" : "var(--red)", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {accuracyRate}% accurate
            </span>
          )}
          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
            {executedCount} executed
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--green)", display: "inline-block" }} /> BUY: profitable vs cost basis · SELL: price hit target
        </span>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#60a5fa", display: "inline-block" }} /> Pending: &lt;7 days old or no target
        </span>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {rows.map((row) => {
          const isSell = row.action_type === "sell" || row.action_type === "trim";
          return (
            <div
              key={row.id}
              style={{
                padding: "10px 12px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: row.thesis ? "6px" : "0" }}>
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: actionColor[row.action_type] ?? "var(--text-secondary)", background: actionBg[row.action_type] ?? "var(--bg-elevated)", border: `1px solid ${(actionColor[row.action_type] ?? "var(--border-subtle)") + "30"}`, padding: "1px 6px", borderRadius: "var(--radius-sm)", flexShrink: 0 }}>
                  {row.action_type}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {row.ticker}
                </span>
                {row.company_name && (
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {row.company_name}
                  </span>
                )}
                {!row.company_name && <span style={{ flex: 1 }} />}

                {/* Performance value */}
                {row.plPct !== null && !isSell && (
                  <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: verdictColor[row.verdict], flexShrink: 0 }}>
                    {formatPct(row.plPct)}
                  </span>
                )}
                {isSell && row.sellPriceDrop !== null && (
                  <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: verdictColor[row.verdict], flexShrink: 0 }}>
                    {row.verdict === "correct" ? "target reached" : "above target"}
                  </span>
                )}

                {/* Verdict dot with tooltip-style title */}
                <div
                  title={verdictDotTitle[row.verdict]}
                  style={{ width: "6px", height: "6px", borderRadius: "50%", background: verdictColor[row.verdict], flexShrink: 0 }}
                />
              </div>

              {/* Price row */}
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                {row.currentPrice !== null && (
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    Now <strong style={{ color: "var(--text-secondary)" }}>${row.currentPrice.toFixed(2)}</strong>
                  </span>
                )}
                {row.costBasis !== null && !isSell && (
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    Avg cost <strong style={{ color: "var(--text-secondary)" }}>${row.costBasis.toFixed(2)}</strong>
                  </span>
                )}
                {row.target_price_1 !== null && (
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                    {isSell ? "Sell target" : "AI target"}{" "}
                    <strong style={{ color: "#a78bfa" }}>${row.target_price_1.toFixed(2)}</strong>
                    {!isSell && row.vsTarget !== null && (
                      <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>
                        ({row.vsTarget > 0 ? "+" : ""}{row.vsTarget.toFixed(1)}% to target)
                      </span>
                    )}
                  </span>
                )}
                <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto" }}>
                  {row.daysAgo === 0 ? "today" : `${row.daysAgo}d ago`}
                  {row.tooEarly && row.verdict === "pending" && " · too early to score"}
                  {row.conviction && ` · ${row.conviction}`}
                </span>
              </div>

              {row.thesis && (
                <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {row.thesis}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
        Accuracy scored after 7+ days. BUYs: correct if profitable vs cost basis. SELLs: correct if price hit the AI sell target.
      </p>
    </div>
  );
}
