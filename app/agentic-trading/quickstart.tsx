"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortfolio } from "@/app/portfolios/actions";
import { createStrategy } from "@/app/strategies/actions";
import { assignStrategyToPortfolio } from "@/app/portfolios/[id]/assign-strategy-actions";

type Portfolio = { id: string; name: string };
type Strategy = { id: string; name: string };

// Sensible starter values for a first strategy — not exposed as separate
// inputs here to keep the quick-create form to two fields. Anyone who wants
// to tune position sizing / cash range / turnover can do that in the full
// Strategy Builder afterward; this just gets someone to a usable, assignable
// strategy in one step instead of sending them away first.
const STARTER_DEFAULTS = {
  style: "Growth", riskLevel: "Moderate",
  maxPositionPct: "25", minPositionPct: "2",
  turnoverPreference: "Moderate", cashMinPct: "5", cashMaxPct: "20",
};

export default function AgenticQuickstart({
  portfolios, strategies, assignedPairs,
}: {
  portfolios: Portfolio[];
  strategies: Strategy[];
  assignedPairs: { portfolioId: string; strategyId: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [portfolioName, setPortfolioName] = useState("");
  const [strategyName, setStrategyName] = useState("");
  const [strategyGuidance, setStrategyGuidance] = useState("");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState(portfolios[0]?.id ?? "");
  const [selectedStrategyId, setSelectedStrategyId] = useState(strategies[0]?.id ?? "");

  const hasPortfolio = portfolios.length > 0;
  const hasStrategy = strategies.length > 0;
  const isAssigned = assignedPairs.some((a) => a.portfolioId === selectedPortfolioId && a.strategyId === selectedStrategyId);
  const allSet = hasPortfolio && hasStrategy && assignedPairs.length > 0;

  function doCreatePortfolio() {
    if (!portfolioName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", portfolioName.trim());
        fd.set("account_type", "taxable");
        await createPortfolio(fd);
        setPortfolioName("");
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Could not create portfolio."); }
    });
  }

  function doCreateStrategy() {
    if (!strategyName.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("name", strategyName.trim());
        fd.set("prompt_text", strategyGuidance.trim() || `Follow a ${STARTER_DEFAULTS.style.toLowerCase()}, ${STARTER_DEFAULTS.riskLevel.toLowerCase()}-risk approach. Refine this guidance anytime in the Strategy Builder.`);
        fd.set("style", STARTER_DEFAULTS.style);
        fd.set("risk_level", STARTER_DEFAULTS.riskLevel);
        fd.set("max_position_pct", STARTER_DEFAULTS.maxPositionPct);
        fd.set("min_position_pct", STARTER_DEFAULTS.minPositionPct);
        fd.set("turnover_preference", STARTER_DEFAULTS.turnoverPreference);
        fd.set("cash_min_pct", STARTER_DEFAULTS.cashMinPct);
        fd.set("cash_max_pct", STARTER_DEFAULTS.cashMaxPct);
        await createStrategy(fd);
        setStrategyName(""); setStrategyGuidance("");
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Could not create strategy."); }
    });
  }

  function doAssign() {
    if (!selectedPortfolioId || !selectedStrategyId) return;
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("portfolio_id", selectedPortfolioId);
        fd.set("strategy_id", selectedStrategyId);
        await assignStrategyToPortfolio(fd);
        router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : "Could not assign strategy."); }
    });
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--card-border)",
    background: "var(--bg-elevated, rgba(255,255,255,0.03))", color: "var(--text-primary)", fontSize: "13px",
    fontFamily: "var(--font-body)", outline: "none",
  };
  const btnStyle: React.CSSProperties = {
    padding: "9px 16px", borderRadius: "8px", border: "none", background: "var(--brand-blue)", color: "white",
    fontSize: "13px", fontWeight: 700, fontFamily: "var(--font-body)", cursor: "pointer", whiteSpace: "nowrap",
  };

  if (allSet) {
    return (
      <div style={{ background: "rgba(63,174,74,0.08)", border: "1px solid rgba(63,174,74,0.25)", borderRadius: "var(--radius-lg)", padding: "14px 18px", marginBottom: "32px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "2px" }}>✓ You&apos;re set up</div>
        <div style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
          You have a strategy assigned to a portfolio — skip to Step 3 below. Manage either anytime in <Link href="/strategies" style={{ color: "var(--brand-blue)" }}>Strategies</Link> or <Link href="/portfolios" style={{ color: "var(--brand-blue)" }}>Portfolios</Link>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "18px", marginBottom: "32px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>Quick start</div>
      <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "16px" }}>
        Steps 1 and 2 below need a portfolio and a strategy to exist first — set both up here without leaving this page.
      </p>

      {!hasPortfolio && (
        <div style={{ marginBottom: hasStrategy ? 0 : "16px" }}>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Create a portfolio</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <input value={portfolioName} onChange={(e) => setPortfolioName(e.target.value)} placeholder="e.g. Agentic" style={inputStyle} />
            <button type="button" onClick={doCreatePortfolio} disabled={pending || !portfolioName.trim()} style={{ ...btnStyle, opacity: pending || !portfolioName.trim() ? 0.6 : 1 }}>
              {pending ? "…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {hasPortfolio && !hasStrategy && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Create a starter strategy</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <input value={strategyName} onChange={(e) => setStrategyName(e.target.value)} placeholder="Strategy name, e.g. Breakout Growth" style={inputStyle} />
            <textarea value={strategyGuidance} onChange={(e) => setStrategyGuidance(e.target.value)} placeholder="What should it look for? (optional — you can refine this later in the Strategy Builder)" rows={3} style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-body)" }} />
            <div>
              <button type="button" onClick={doCreateStrategy} disabled={pending || !strategyName.trim()} style={{ ...btnStyle, opacity: pending || !strategyName.trim() ? 0.6 : 1 }}>
                {pending ? "…" : "Create strategy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {hasPortfolio && hasStrategy && !isAssigned && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>Assign a strategy to a portfolio</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <select value={selectedStrategyId} onChange={(e) => setSelectedStrategyId(e.target.value)} style={{ ...inputStyle, flex: "1 1 160px" }}>
              {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>→</span>
            <select value={selectedPortfolioId} onChange={(e) => setSelectedPortfolioId(e.target.value)} style={{ ...inputStyle, flex: "1 1 160px" }}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" onClick={doAssign} disabled={pending} style={{ ...btnStyle, opacity: pending ? 0.6 : 1 }}>
              {pending ? "…" : "Assign"}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ fontSize: "11.5px", color: "var(--red)", marginTop: "10px" }}>{error}</p>}
    </div>
  );
}
