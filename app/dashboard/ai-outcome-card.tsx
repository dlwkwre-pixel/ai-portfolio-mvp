import Link from "next/link";
import { computeRecommendationScorecard } from "@/lib/portfolio/recommendation-scorecard";

// The trust loop, surfaced: how the AI calls you actually followed have done,
// aggregated across every portfolio. Renders nothing until there are scored
// outcomes — no empty shell for new users.
export default async function AiOutcomeCard({
  portfolios,
}: {
  portfolios: { id: string; name: string }[];
}) {
  if (portfolios.length === 0) return null;

  let scored = 0;
  let correct = 0;
  let plSum = 0;
  let plCount = 0;
  let bestPortfolioId: string | null = null;
  let bestScored = 0;

  try {
    const cards = await Promise.all(
      portfolios.map(async (p) => ({ id: p.id, card: await computeRecommendationScorecard(p.id) })),
    );
    for (const { id, card } of cards) {
      scored += card.scoredCount;
      correct += card.correctCount;
      if (card.avgPlPct !== null) {
        // avgPlPct is per-portfolio; weight it back by its row count
        const n = card.rows.filter((r) => r.plPct !== null).length;
        plSum += card.avgPlPct * n;
        plCount += n;
      }
      if (card.scoredCount > bestScored) { bestScored = card.scoredCount; bestPortfolioId = id; }
    }
  } catch {
    return null; // metrics must never break the dashboard
  }

  if (scored < 3) return null; // too little data to be meaningful

  const accuracy = Math.round((correct / scored) * 100);
  const avgPl = plCount > 0 ? plSum / plCount : null;
  const isUp = (avgPl ?? 0) >= 0;

  return (
    <Link
      href={bestPortfolioId ? `/portfolios/${bestPortfolioId}?tab=ai` : "/portfolios"}
      style={{
        display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap",
        marginBottom: "16px", padding: "13px 18px", textDecoration: "none",
        background: "var(--bg-card)", border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
        AI calls you followed
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: accuracy >= 50 ? "var(--green)" : "var(--red)" }}>
          {accuracy}%
        </span>
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>correct</span>
      </span>
      {avgPl !== null && (
        <span style={{ display: "flex", alignItems: "baseline", gap: "5px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: isUp ? "var(--green)" : "var(--red)" }}>
            {isUp ? "+" : ""}{avgPl.toFixed(1)}%
          </span>
          <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>avg P/L</span>
        </span>
      )}
      <span style={{ fontSize: "var(--text-2xs)", color: "var(--text-muted)" }}>
        {scored} scored call{scored !== 1 ? "s" : ""}
      </span>
      <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--brand-blue)", fontWeight: 600, flexShrink: 0 }}>
        See outcomes →
      </span>
    </Link>
  );
}
