import { createClient } from "@/lib/supabase/server";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";

type Props = {
  portfolioId: string;
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function formatPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

export default async function RecommendationOutcomesSection({ portfolioId }: Props) {
  const supabase = await createClient();

  const { data: executedItems } = await supabase
    .from("recommendation_items")
    .select("id, ticker, company_name, action_type, conviction, target_price_1, thesis, created_at")
    .eq("portfolio_id", portfolioId)
    .eq("recommendation_status", "executed")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!executedItems?.length) {
    return (
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", padding: "20px" }}>
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

  // Fetch current holdings for cost basis
  const { data: holdings } = await supabase
    .from("holdings")
    .select("ticker, average_cost_basis, shares")
    .eq("portfolio_id", portfolioId);

  const holdingsMap = new Map(
    (holdings ?? []).map((h) => [h.ticker.toUpperCase(), h])
  );

  // Get unique tickers and fetch quotes
  const uniqueTickers = [...new Set(executedItems.map((i) => i.ticker?.toUpperCase()).filter(Boolean))] as string[];
  const quoteResults = await Promise.allSettled(
    uniqueTickers.map((t) => getFinnhubQuote(t).then((q) => ({ ticker: t, quote: q })))
  );
  const quoteMap = new Map<string, { c: number; pc: number }>();
  for (const r of quoteResults) {
    if (r.status === "fulfilled" && r.value.quote && r.value.quote.c > 0) {
      quoteMap.set(r.value.ticker, { c: r.value.quote.c, pc: r.value.quote.pc ?? 0 });
    }
  }

  type OutcomeRow = {
    id: string;
    ticker: string;
    company_name: string | null;
    action_type: string;
    conviction: string | null;
    target_price_1: number | null;
    thesis: string | null;
    created_at: string;
    currentPrice: number | null;
    costBasis: number | null;
    plPct: number | null;
    daysAgo: number;
    verdict: "win" | "loss" | "neutral" | "no-data";
    vsTarget: number | null;
  };

  const rows: OutcomeRow[] = executedItems.map((item) => {
    const ticker = (item.ticker ?? "").toUpperCase();
    const quote = quoteMap.get(ticker) ?? null;
    const holding = holdingsMap.get(ticker) ?? null;
    const action = (item.action_type ?? "").toLowerCase();
    const isBuy = action === "buy" || action === "add";
    const isSell = action === "sell" || action === "trim";

    const currentPrice = quote?.c ?? null;
    const costBasis = holding ? Number(holding.average_cost_basis) : null;
    const target = item.target_price_1 ? Number(item.target_price_1) : null;

    let plPct: number | null = null;
    if (isBuy && currentPrice !== null && costBasis !== null && costBasis > 0) {
      plPct = ((currentPrice - costBasis) / costBasis) * 100;
    }

    let vsTarget: number | null = null;
    if (currentPrice !== null && target !== null && target > 0) {
      vsTarget = ((target - currentPrice) / currentPrice) * 100;
    }

    let verdict: OutcomeRow["verdict"] = "no-data";
    if (isBuy && plPct !== null) {
      verdict = plPct >= 0 ? "win" : "loss";
    } else if (isSell && currentPrice !== null) {
      // For sells, check if price went down (confirming the sell was right)
      // Use target_price_1 as the "expected lower price" — if current < target, sell was premature
      // If no target, just mark neutral
      verdict = "neutral";
    }

    return {
      id: item.id,
      ticker,
      company_name: item.company_name,
      action_type: action,
      conviction: item.conviction,
      target_price_1: target,
      thesis: item.thesis,
      created_at: item.created_at,
      currentPrice,
      costBasis,
      plPct,
      daysAgo: daysSince(item.created_at),
      verdict,
      vsTarget,
    };
  });

  const wins = rows.filter((r) => r.verdict === "win").length;
  const losses = rows.filter((r) => r.verdict === "loss").length;
  const tracked = wins + losses;
  const winRate = tracked > 0 ? Math.round((wins / tracked) * 100) : null;

  const verdictColor = { win: "#00d395", loss: "#f87171", neutral: "#60a5fa", "no-data": "var(--text-muted)" };
  const verdictLabel = { win: "Gain", loss: "Loss", neutral: "Neutral", "no-data": "No data" };

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="#00d395">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>AI Recommendation Outcomes</h2>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          {winRate !== null && (
            <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: winRate >= 50 ? "rgba(0,211,149,0.1)" : "rgba(248,113,113,0.1)", border: `1px solid ${winRate >= 50 ? "rgba(0,211,149,0.25)" : "rgba(248,113,113,0.25)"}`, color: winRate >= 50 ? "#00d395" : "#f87171", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {winRate}% win rate
            </span>
          )}
          <span style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
            {executedItems.length} executed
          </span>
        </div>
      </div>

      {/* Rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {rows.map((row) => (
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
              {/* Action badge */}
              <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: actionColor[row.action_type] ?? "var(--text-secondary)", background: actionBg[row.action_type] ?? "var(--bg-elevated)", border: `1px solid ${actionColor[row.action_type] ?? "var(--border-subtle)"}30`, padding: "1px 6px", borderRadius: "var(--radius-sm)", flexShrink: 0 }}>
                {row.action_type}
              </span>

              {/* Ticker */}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                {row.ticker}
              </span>

              {/* Company */}
              {row.company_name && (
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {row.company_name}
                </span>
              )}

              {/* Spacer */}
              {!row.company_name && <span style={{ flex: 1 }} />}

              {/* P&L */}
              {row.plPct !== null && (
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 600, color: verdictColor[row.verdict], flexShrink: 0 }}>
                  {formatPct(row.plPct)}
                </span>
              )}

              {/* Verdict dot */}
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: verdictColor[row.verdict], flexShrink: 0 }} />
            </div>

            {/* Price row */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: row.thesis ? "0" : "2px" }}>
              {row.currentPrice !== null && (
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  Now <strong style={{ color: "var(--text-secondary)" }}>${row.currentPrice.toFixed(2)}</strong>
                </span>
              )}
              {row.costBasis !== null && (
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  Avg cost <strong style={{ color: "var(--text-secondary)" }}>${row.costBasis.toFixed(2)}</strong>
                </span>
              )}
              {row.target_price_1 !== null && (
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  Target <strong style={{ color: "#a78bfa" }}>${row.target_price_1.toFixed(2)}</strong>
                  {row.vsTarget !== null && (
                    <span style={{ color: row.vsTarget > 0 ? "#00d395" : "#f87171", marginLeft: "4px" }}>
                      ({row.vsTarget > 0 ? "+" : ""}{row.vsTarget.toFixed(1)}% to go)
                    </span>
                  )}
                </span>
              )}
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginLeft: "auto" }}>
                {row.daysAgo === 0 ? "today" : `${row.daysAgo}d ago`}
                {row.conviction && ` · ${row.conviction} conviction`}
              </span>
            </div>

            {/* Thesis snippet */}
            {row.thesis && (
              <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {row.thesis}
              </p>
            )}
          </div>
        ))}
      </div>

      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
        P&L vs average cost basis in holdings. BUY outcomes only. Win rate excludes HOLDs and SELLs.
      </p>
    </div>
  );
}
