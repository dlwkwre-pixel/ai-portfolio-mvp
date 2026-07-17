import Link from "next/link";
import { computeRecommendationScorecard, type Verdict } from "@/lib/portfolio/recommendation-scorecard";

// Compact "AI Scorecard" for the portfolio Overview — a glanceable answer to "is the AI
// actually helping?" without digging into the analysis tab. Full detail lives there.
export default async function AIScorecardCard({ portfolioId }: { portfolioId: string }) {
  const sc = await computeRecommendationScorecard(portfolioId);
  if (sc.executedCount === 0) return null; // nothing executed yet → don't show an empty card

  const acc = sc.accuracyRate;
  const accColor = acc == null ? "var(--text-tertiary)" : acc >= 50 ? "var(--green)" : "var(--red)";
  const avg = sc.avgPlPct;
  const recent = sc.rows.slice(0, 4);

  const verdictColor: Record<Verdict, string> = {
    correct: "var(--green)", incorrect: "#f87171", pending: "#60a5fa", "no-data": "var(--text-muted)",
  };
  const actionColor: Record<string, string> = {
    buy: "var(--green)", add: "var(--green)", sell: "#f87171", trim: "#f87171", hold: "#60a5fa", watch: "#a78bfa",
  };
  const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <div className="bt-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>AI Scorecard</h2>
        <Link href={`/portfolios/${portfolioId}?tab=ai`} style={{ fontSize: "11px", color: "var(--accent)", textDecoration: "none" }}>
          View analysis →
        </Link>
      </div>

      {/* Hero stats */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "16px", flexWrap: "wrap", marginBottom: "14px" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "30px", fontWeight: 700, color: accColor, lineHeight: 1 }}>
            {acc != null ? `${acc}%` : "—"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>
            {acc != null ? `${sc.correctCount} of ${sc.scoredCount} on track` : "scored after 7+ days"}
          </div>
        </div>
        {avg != null && (
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: avg >= 0 ? "var(--green)" : "#f87171", lineHeight: 1 }}>
              {fmtPct(avg)}
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>avg since suggested</div>
          </div>
        )}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1 }}>
            {sc.executedCount}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>executed</div>
        </div>
      </div>

      {/* Recent recommendations */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {recent.map((r) => {
          const isSell = r.action_type === "sell" || r.action_type === "trim";
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: actionColor[r.action_type] ?? "var(--text-secondary)", flexShrink: 0, width: "34px" }}>
                {r.action_type}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-primary)", width: "52px", flexShrink: 0 }}>{r.ticker}</span>
              <span style={{ flex: 1, fontSize: "11px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.daysAgo === 0 ? "today" : `${r.daysAgo}d ago`}
              </span>
              {r.plPct != null && !isSell && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600, color: verdictColor[r.verdict], flexShrink: 0 }}>
                  {fmtPct(r.plPct)}
                </span>
              )}
              {isSell && (
                <span style={{ fontSize: "10px", color: verdictColor[r.verdict], flexShrink: 0 }}>
                  {r.verdict === "correct" ? "on target" : r.verdict === "incorrect" ? "above target" : "pending"}
                </span>
              )}
              <span title={r.verdict} style={{ width: "6px", height: "6px", borderRadius: "50%", background: verdictColor[r.verdict], flexShrink: 0 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
