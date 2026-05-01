"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveOnboardingProgress,
  createOnboardingPortfolio,
  addOnboardingHoldings,
  setOnboardingCash,
  createAndAssignStrategy,
  assignExistingStrategyToPortfolio,
  triggerFirstRecommendation,
  STARTER_STRATEGIES,
} from "./actions";

type Portfolio = { id: string; name: string; account_type: string | null };
type Strategy = { id: string; name: string; description: string | null; risk_level: string | null };
type DraftHolding = { ticker: string; shares: string; costBasis: string };

const TOTAL_STEPS = 7;
const ACCOUNT_TYPES = [
  { value: "brokerage", label: "Brokerage" },
  { value: "roth_ira", label: "Roth IRA" },
  { value: "traditional_ira", label: "Traditional IRA" },
  { value: "paper_trade", label: "Paper Trade" },
];

function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    conservative: "var(--green)",
    moderate: "var(--amber)",
    aggressive: "var(--red)",
  };
  return (
    <span style={{
      fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
      color: colors[level] ?? "var(--text-tertiary)",
      letterSpacing: "0.06em",
    }}>
      {level}
    </span>
  );
}

export default function OnboardingModal({
  initialStep,
  existingPortfolios,
  existingStrategies,
}: {
  initialStep: number;
  existingPortfolios: Portfolio[];
  existingStrategies: Strategy[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(Math.max(1, initialStep));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 2: Portfolio
  const hasExisting = existingPortfolios.length > 0;
  const [usingExisting, setUsingExisting] = useState(hasExisting);
  const [portfolioId, setPortfolioId] = useState(existingPortfolios[0]?.id ?? "");
  const [portfolioName, setPortfolioName] = useState("My Portfolio");
  const [accountType, setAccountType] = useState("brokerage");

  // ── Step 3: Holdings
  const [draftHoldings, setDraftHoldings] = useState<DraftHolding[]>([]);
  const [holdingTicker, setHoldingTicker] = useState("");
  const [holdingShares, setHoldingShares] = useState("");
  const [holdingCost, setHoldingCost] = useState("");
  const [holdingsSaved, setHoldingsSaved] = useState(false);

  // ── Step 4: Cash
  const [cash, setCash] = useState("0");
  const [cashSaved, setCashSaved] = useState(false);

  // ── Step 5: Strategy
  const [strategyTab, setStrategyTab] = useState<"starter" | "custom" | "existing">(
    existingStrategies.length > 0 ? "existing" : "starter"
  );
  const [selectedStarterIdx, setSelectedStarterIdx] = useState(0);
  const [customRisk, setCustomRisk] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [customHorizon, setCustomHorizon] = useState<"short" | "medium" | "long">("medium");
  const [customStyle, setCustomStyle] = useState("balanced");
  const [selectedExistingId, setSelectedExistingId] = useState(existingStrategies[0]?.id ?? "");
  const [strategySaved, setStrategySaved] = useState(false);

  // ── Step 7: Scan
  const [scanStatus, setScanStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Helpers

  function dismiss() {
    router.refresh();
  }

  async function go(nextStep: number, saveStatus?: Parameters<typeof saveOnboardingProgress>[1]) {
    setError(null);
    setSaving(true);
    try {
      await saveOnboardingProgress(nextStep, saveStatus ?? "in_progress");
      setStep(nextStep);
    } catch {
      // Non-critical — just advance the step
      setStep(nextStep);
    } finally {
      setSaving(false);
    }
  }

  async function handleSkipAll() {
    setSaving(true);
    try { await saveOnboardingProgress(step, "skipped"); } catch {}
    setSaving(false);
    dismiss();
  }

  async function handleFinish() {
    setSaving(true);
    try { await saveOnboardingProgress(TOTAL_STEPS, "completed"); } catch {}
    setSaving(false);
    dismiss();
  }

  // ── Step handlers

  async function handleStep2Next() {
    setError(null);
    setSaving(true);
    try {
      if (usingExisting) {
        if (!portfolioId) throw new Error("Select a portfolio to continue.");
        await go(3);
      } else {
        if (!portfolioName.trim()) throw new Error("Portfolio name is required.");
        const result = await createOnboardingPortfolio({
          name: portfolioName.trim(),
          account_type: accountType,
        });
        setPortfolioId(result.id);
        await go(3);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function addDraftHolding() {
    const ticker = holdingTicker.trim().toUpperCase();
    if (!ticker || !holdingShares || !holdingCost) return;
    if (draftHoldings.some((h) => h.ticker === ticker)) {
      setError(`${ticker} already added.`);
      return;
    }
    setDraftHoldings((prev) => [...prev, { ticker, shares: holdingShares, costBasis: holdingCost }]);
    setHoldingTicker("");
    setHoldingShares("");
    setHoldingCost("");
    setError(null);
  }

  async function handleStep3Next() {
    setError(null);
    if (holdingsSaved || draftHoldings.length === 0) {
      await go(4);
      return;
    }
    setSaving(true);
    try {
      if (portfolioId && draftHoldings.length > 0) {
        await addOnboardingHoldings(
          portfolioId,
          draftHoldings.map((h) => ({
            ticker: h.ticker,
            shares: parseFloat(h.shares),
            average_cost_basis: parseFloat(h.costBasis),
          }))
        );
        setHoldingsSaved(true);
      }
      await go(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save holdings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStep4Next() {
    setError(null);
    const cashNum = parseFloat(cash) || 0;
    if (cashNum < 0) { setError("Cash must be $0 or more."); return; }
    setSaving(true);
    try {
      if (portfolioId && !cashSaved) {
        await setOnboardingCash(portfolioId, cashNum);
        setCashSaved(true);
      }
      await go(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save cash.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStep5Next() {
    setError(null);
    if (strategySaved) { await go(6); return; }
    if (!portfolioId) { await go(6); return; }
    setSaving(true);
    try {
      if (strategyTab === "existing" && selectedExistingId) {
        await assignExistingStrategyToPortfolio(portfolioId, selectedExistingId);
      } else if (strategyTab === "starter") {
        const s = STARTER_STRATEGIES[selectedStarterIdx];
        await createAndAssignStrategy(portfolioId, s);
      } else {
        // Custom
        const riskMap: Record<string, { max: number; cashMax: number; turnover: string }> = {
          conservative: { max: 10, cashMax: 10, turnover: "low" },
          moderate: { max: 15, cashMax: 15, turnover: "medium" },
          aggressive: { max: 20, cashMax: 20, turnover: "high" },
        };
        const horizonMap: Record<string, string> = {
          short: "short_term", medium: "medium_term", long: "long_term",
        };
        const rm = riskMap[customRisk];
        await createAndAssignStrategy(portfolioId, {
          name: `Custom ${customStyle.charAt(0).toUpperCase() + customStyle.slice(1)} Strategy`,
          description: `${customRisk} risk, ${customHorizon}-term ${customStyle} strategy.`,
          style: customStyle,
          risk_level: customRisk,
          prompt_text: `Portfolio with ${customRisk} risk tolerance. Investment horizon: ${customHorizon}-term. Primary style: ${customStyle}. Optimize for appropriate risk-adjusted returns. Suitable position sizing and diversification.`,
          max_position_pct: rm.max,
          min_position_pct: 2,
          cash_min_pct: 5,
          cash_max_pct: rm.cashMax,
          turnover_preference: rm.turnover,
          holding_period_bias: horizonMap[customHorizon],
        });
      }
      setStrategySaved(true);
      await go(6);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save strategy.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunScan() {
    if (!portfolioId) return;
    setScanStatus("running");
    setScanError(null);
    try {
      await triggerFirstRecommendation(portfolioId);
      setScanStatus("done");
    } catch (e) {
      setScanStatus("error");
      setScanError(e instanceof Error ? e.message : "AI scan failed. You can run it later from the portfolio page.");
    }
  }

  // ── Progress bar

  const progressPct = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  // ── Render

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }}>
      {/* Backdrop */}
      <div
        onClick={handleSkipAll}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(4, 13, 26, 0.85)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Card */}
      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: "520px",
        maxHeight: "90vh",
        background: "var(--bg-surface)",
        border: "1px solid var(--card-border)",
        borderRadius: "var(--radius-xl)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(37,99,235,0.12)",
        animation: "obFadeUp 0.25s ease both",
      }}>
        <style>{`
          @keyframes obFadeUp {
            from { opacity: 0; transform: translateY(12px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        {/* Progress bar */}
        <div style={{ height: "3px", background: "var(--border-subtle)", flexShrink: 0 }}>
          <div style={{
            height: "100%",
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, var(--brand-blue), var(--brand-violet))",
            transition: "width 0.4s ease",
          }} />
        </div>

        {/* Header */}
        <div style={{
          padding: "16px 20px 14px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "28px", height: "28px",
              background: "linear-gradient(135deg, var(--brand-blue), var(--brand-violet))",
              borderRadius: "8px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="12" height="12" viewBox="2 4 20 16" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                BuyTune Setup
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                Step {step} of {TOTAL_STEPS}
              </div>
            </div>
          </div>
          <button
            onClick={handleSkipAll}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "11px", padding: "4px 8px", borderRadius: "6px" }}
          >
            Skip for now
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 22px 18px" }}>
          {error && (
            <div style={{
              marginBottom: "14px", padding: "9px 12px",
              background: "rgba(255,92,92,0.08)", border: "1px solid rgba(255,92,92,0.2)",
              borderRadius: "8px", fontSize: "12px", color: "var(--red)",
            }}>
              {error}
            </div>
          )}

          {/* ── Step 1: Welcome */}
          {step === 1 && (
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{
                width: "64px", height: "64px", margin: "0 auto 20px",
                background: "linear-gradient(135deg, rgba(37,99,235,0.15), rgba(124,58,237,0.1))",
                border: "1px solid rgba(37,99,235,0.2)",
                borderRadius: "18px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "28px",
                boxShadow: "0 0 40px rgba(37,99,235,0.15)",
              }}>
                📊
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.4px", marginBottom: "10px" }}>
                Welcome to BuyTune
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "24px", maxWidth: "360px", margin: "0 auto 24px" }}>
                Build your portfolio, define your strategy, and let BuyTune surface
                AI-powered recommendations — tailored to how you invest.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px", margin: "0 auto" }}>
                {[
                  { icon: "📁", text: "Create your portfolio and add holdings" },
                  { icon: "🎯", text: "Choose or build an investment strategy" },
                  { icon: "🤖", text: "Get AI-powered buy, hold, and sell signals" },
                ].map((item) => (
                  <div key={item.text} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "8px", textAlign: "left" }}>
                    <span style={{ fontSize: "14px" }}>{item.icon}</span>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Portfolio */}
          {step === 2 && (
            <div>
              <h2 style={headingStyle}>Create your portfolio</h2>
              <p style={subStyle}>This is where your holdings, cash, and AI recommendations live.</p>

              {hasExisting && (
                <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
                  {(["select", "create"] as const).map((mode) => {
                    const active = mode === (usingExisting ? "select" : "create");
                    return (
                      <button key={mode} onClick={() => setUsingExisting(mode === "select")}
                        className={active ? "bt-btn bt-btn-primary bt-btn-sm" : "bt-btn bt-btn-ghost bt-btn-sm"}
                      >
                        {mode === "select" ? "Use existing" : "Create new"}
                      </button>
                    );
                  })}
                </div>
              )}

              {usingExisting && hasExisting ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {existingPortfolios.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPortfolioId(p.id)}
                      style={{
                        padding: "11px 14px", textAlign: "left", cursor: "pointer",
                        background: portfolioId === p.id ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
                        border: `1px solid ${portfolioId === p.id ? "rgba(37,99,235,0.4)" : "var(--card-border)"}`,
                        borderRadius: "10px", transition: "all 0.15s",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{p.account_type?.replace(/_/g, " ")}</div>
                      </div>
                      {portfolioId === p.id && (
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="var(--brand-blue)">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={labelStyle}>Portfolio name</label>
                    <input
                      className="bt-input"
                      value={portfolioName}
                      onChange={(e) => setPortfolioName(e.target.value)}
                      placeholder="My Portfolio"
                      maxLength={80}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Account type</label>
                    <select
                      className="bt-select"
                      value={accountType}
                      onChange={(e) => setAccountType(e.target.value)}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Holdings */}
          {step === 3 && (
            <div>
              <h2 style={headingStyle}>Add your current holdings</h2>
              <p style={subStyle}>Enter stocks you already own. You can add more later from any portfolio page.</p>

              <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "flex-end" }}>
                <div style={{ flex: "0 0 90px" }}>
                  <label style={labelStyle}>Ticker</label>
                  <input
                    className="bt-input"
                    value={holdingTicker}
                    onChange={(e) => setHoldingTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                    placeholder="AAPL"
                    maxLength={8}
                    onKeyDown={(e) => e.key === "Enter" && addDraftHolding()}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Shares</label>
                  <input
                    className="bt-input"
                    type="number"
                    min="0"
                    step="any"
                    value={holdingShares}
                    onChange={(e) => setHoldingShares(e.target.value)}
                    placeholder="10"
                    onKeyDown={(e) => e.key === "Enter" && addDraftHolding()}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Avg cost ($)</label>
                  <input
                    className="bt-input"
                    type="number"
                    min="0"
                    step="any"
                    value={holdingCost}
                    onChange={(e) => setHoldingCost(e.target.value)}
                    placeholder="150.00"
                    onKeyDown={(e) => e.key === "Enter" && addDraftHolding()}
                  />
                </div>
                <button
                  onClick={addDraftHolding}
                  className="bt-btn bt-btn-primary bt-btn-sm"
                  disabled={!holdingTicker || !holdingShares || !holdingCost}
                  style={{ flexShrink: 0, marginBottom: "1px" }}
                >
                  Add
                </button>
              </div>

              {draftHoldings.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {draftHoldings.map((h) => (
                    <div key={h.ticker} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--card-bg)", border: "1px solid var(--card-border)",
                      borderRadius: "8px",
                    }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <span className="ticker" style={{ fontSize: "11px" }}>{h.ticker}</span>
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{h.shares} shares</span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>${parseFloat(h.costBasis).toFixed(2)} avg</span>
                      </div>
                      <button
                        onClick={() => setDraftHoldings((prev) => prev.filter((x) => x.ticker !== h.ticker))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "16px", lineHeight: 1, padding: "0 2px" }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: "18px", textAlign: "center",
                  border: "1px dashed var(--card-border)", borderRadius: "10px",
                  fontSize: "12px", color: "var(--text-muted)",
                }}>
                  No holdings added yet — you can skip this and add them later
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Cash */}
          {step === 4 && (
            <div>
              <h2 style={headingStyle}>How much cash do you have available?</h2>
              <p style={subStyle}>
                This represents uninvested cash in your <strong style={{ color: "var(--text-primary)" }}>
                  {existingPortfolios.find((p) => p.id === portfolioId)?.name || "portfolio"}
                </strong>. Used by the AI when sizing buy recommendations.
              </p>
              <div>
                <label style={labelStyle}>Cash balance ($)</label>
                <input
                  className="bt-input"
                  type="number"
                  min="0"
                  step="any"
                  value={cash}
                  onChange={(e) => setCash(e.target.value)}
                  placeholder="5000"
                  style={{ fontSize: "18px", fontFamily: "var(--font-mono)" }}
                />
                <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                  You can update this anytime from your portfolio page.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 5: Strategy */}
          {step === 5 && (
            <div>
              <h2 style={headingStyle}>Choose an investment strategy</h2>
              <p style={subStyle}>Your strategy guides the AI when generating recommendations for your portfolio.</p>

              {/* Tabs */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
                {(["starter", "custom", ...(existingStrategies.length > 0 ? ["existing"] : [])] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStrategyTab(tab as typeof strategyTab)}
                    className={strategyTab === tab ? "bt-btn bt-btn-primary bt-btn-sm" : "bt-btn bt-btn-ghost bt-btn-sm"}
                  >
                    {tab === "starter" ? "Starter templates" : tab === "custom" ? "Build custom" : "My strategies"}
                  </button>
                ))}
              </div>

              {/* Starter templates */}
              {strategyTab === "starter" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {STARTER_STRATEGIES.map((s, i) => (
                    <button
                      key={s.name}
                      onClick={() => setSelectedStarterIdx(i)}
                      style={{
                        padding: "11px 14px", textAlign: "left", cursor: "pointer",
                        background: selectedStarterIdx === i ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
                        border: `1px solid ${selectedStarterIdx === i ? "rgba(37,99,235,0.4)" : "var(--card-border)"}`,
                        borderRadius: "10px", transition: "all 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                          <span style={{ fontSize: "14px" }}>{s.emoji}</span>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{s.name}</span>
                        </div>
                        <RiskBadge level={s.risk_level} />
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{s.tagline}</div>
                    </button>
                  ))}
                </div>
              )}

              {/* Custom builder */}
              {strategyTab === "custom" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={labelStyle}>Risk tolerance</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {(["conservative", "moderate", "aggressive"] as const).map((r) => (
                        <button key={r} onClick={() => setCustomRisk(r)}
                          className={customRisk === r ? "bt-btn bt-btn-primary bt-btn-sm" : "bt-btn bt-btn-ghost bt-btn-sm"}
                          style={{ flex: 1, textTransform: "capitalize" }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Time horizon</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {(["short", "medium", "long"] as const).map((h) => (
                        <button key={h} onClick={() => setCustomHorizon(h)}
                          className={customHorizon === h ? "bt-btn bt-btn-primary bt-btn-sm" : "bt-btn bt-btn-ghost bt-btn-sm"}
                          style={{ flex: 1, textTransform: "capitalize" }}>
                          {h}-term
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Investment style</label>
                    <select className="bt-select" value={customStyle} onChange={(e) => setCustomStyle(e.target.value)}>
                      {["balanced", "growth", "value", "income", "momentum", "thematic"].map((s) => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Existing strategies */}
              {strategyTab === "existing" && existingStrategies.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {existingStrategies.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedExistingId(s.id)}
                      style={{
                        padding: "11px 14px", textAlign: "left", cursor: "pointer",
                        background: selectedExistingId === s.id ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
                        border: `1px solid ${selectedExistingId === s.id ? "rgba(37,99,235,0.4)" : "var(--card-border)"}`,
                        borderRadius: "10px", transition: "all 0.15s",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>{s.name}</div>
                        {s.description && <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{s.description.slice(0, 80)}</div>}
                      </div>
                      {s.risk_level && <RiskBadge level={s.risk_level} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 6: AI Tutorial */}
          {step === 6 && (
            <div>
              <h2 style={headingStyle}>How AI recommendations work</h2>
              <p style={subStyle}>Here&apos;s what to expect once your portfolio is live.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  {
                    icon: "🧠",
                    title: "Context-aware analysis",
                    body: "BuyTune uses your portfolio, holdings, cash balance, and assigned strategy to generate personalized recommendations — not generic market picks.",
                  },
                  {
                    icon: "📋",
                    title: "Action types",
                    body: "Recommendations come with an action: BUY, ADD, TRIM, SELL, HOLD, or WATCH. Each includes a thesis, rationale, conviction level, and suggested sizing.",
                  },
                  {
                    icon: "✅",
                    title: "You stay in control",
                    body: "No trades execute automatically. You review each recommendation and choose to act, reject, or keep watching. Your decisions are tracked over time.",
                  },
                  {
                    icon: "⚡",
                    title: "Powered by Grok + live search",
                    body: "Recommendations use live web and market data, so they reflect current prices, earnings, and news — not stale training data.",
                  },
                ].map((item) => (
                  <div key={item.title} style={{
                    padding: "12px 14px",
                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                    borderRadius: "10px",
                    display: "flex", gap: "12px",
                  }}>
                    <span style={{ fontSize: "18px", flexShrink: 0, marginTop: "1px" }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>{item.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{item.body}</div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "8px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                  BuyTune&apos;s recommendations are informational only and not financial advice. Always apply your own judgement before making investment decisions.
                </div>
              </div>
            </div>
          )}

          {/* ── Step 7: First Scan */}
          {step === 7 && (
            <div>
              <h2 style={headingStyle}>Run your first AI scan</h2>
              <p style={subStyle}>BuyTune will analyze your portfolio and generate initial recommendations.</p>

              {/* Setup summary */}
              <div style={{ padding: "14px 16px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "11px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "4px" }}>Setup summary</div>
                <SummaryRow icon="📁" label="Portfolio" value={existingPortfolios.find((p) => p.id === portfolioId)?.name ?? (portfolioName || "—")} />
                <SummaryRow icon="📊" label="Holdings" value={draftHoldings.length > 0 ? `${draftHoldings.length} stock${draftHoldings.length !== 1 ? "s" : ""}` : "None added"} />
                <SummaryRow icon="💵" label="Cash" value={parseFloat(cash) > 0 ? `$${parseFloat(cash).toLocaleString()}` : "$0"} />
                <SummaryRow icon="🎯" label="Strategy" value={
                  strategyTab === "existing"
                    ? (existingStrategies.find((s) => s.id === selectedExistingId)?.name ?? "—")
                    : strategyTab === "starter"
                    ? STARTER_STRATEGIES[selectedStarterIdx]?.name
                    : `Custom ${customStyle}`
                } />
              </div>

              {draftHoldings.length === 0 && parseFloat(cash) === 0 && (
                <div style={{ padding: "9px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", fontSize: "11px", color: "var(--amber)", marginBottom: "14px", lineHeight: 1.5 }}>
                  Your portfolio has no holdings or cash yet. The AI scan will still run but recommendations may be limited. You can add holdings after setup.
                </div>
              )}

              {scanStatus === "idle" && (
                <button
                  onClick={handleRunScan}
                  disabled={!portfolioId}
                  className="bt-btn bt-btn-primary"
                  style={{ width: "100%", justifyContent: "center", gap: "8px" }}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 1a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 1zM5.05 3.05a.75.75 0 011.06 0l1.062 1.06A.75.75 0 116.11 5.173L5.05 4.11a.75.75 0 010-1.06zM14.95 3.05a.75.75 0 010 1.06l-1.06 1.062a.75.75 0 01-1.062-1.062l1.061-1.06a.75.75 0 011.06 0zM3 9.25a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5H3zM15.5 9.25a.75.75 0 000 1.5H17a.75.75 0 000-1.5h-1.5zM5.05 15.05a.75.75 0 01-1.06-1.06l1.06-1.062a.75.75 0 111.062 1.061L5.05 15.05zM13.879 13.879a.75.75 0 011.06 0l1.062 1.06a.75.75 0 11-1.061 1.062l-1.061-1.06a.75.75 0 010-1.062zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15z" clipRule="evenodd" />
                  </svg>
                  Run First Scan
                </button>
              )}

              {scanStatus === "running" && (
                <div style={{ textAlign: "center", padding: "20px 0" }}>
                  <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                    AI is analyzing your portfolio...
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>This may take 30–60 seconds</div>
                  <div style={{ marginTop: "16px", height: "3px", background: "var(--border-subtle)", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: "60%", background: "linear-gradient(90deg, var(--brand-blue), var(--brand-violet))", animation: "obFadeUp 1.5s ease infinite alternate" }} />
                  </div>
                </div>
              )}

              {scanStatus === "done" && (
                <div style={{ textAlign: "center", padding: "12px 0" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>✅</div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Scan complete!</div>
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    Your recommendations are ready. Head to your portfolio to review them.
                  </div>
                </div>
              )}

              {scanStatus === "error" && (
                <div style={{ padding: "12px 14px", background: "rgba(255,92,92,0.08)", border: "1px solid rgba(255,92,92,0.2)", borderRadius: "8px", fontSize: "12px", color: "var(--red)", lineHeight: 1.5 }}>
                  {scanError || "The AI scan failed. You can run it later from your portfolio page."}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Button row */}
        <div style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex", gap: "8px", alignItems: "center",
          flexShrink: 0,
        }}>
          {/* Back */}
          {step > 1 && step < 7 && (
            <button
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="bt-btn bt-btn-ghost bt-btn-sm"
              disabled={saving}
            >
              ← Back
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Skip step (steps 3, 4, 5) */}
          {[3, 4, 5].includes(step) && (
            <button
              onClick={() => go(step + 1)}
              className="bt-btn bt-btn-ghost bt-btn-sm"
              disabled={saving}
              style={{ color: "var(--text-tertiary)" }}
            >
              Skip
            </button>
          )}

          {/* Primary action */}
          {step === 1 && (
            <button onClick={() => go(2)} className="bt-btn bt-btn-primary" disabled={saving}>
              Get Started →
            </button>
          )}
          {step === 2 && (
            <button onClick={handleStep2Next} className="bt-btn bt-btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Continue →"}
            </button>
          )}
          {step === 3 && (
            <button onClick={handleStep3Next} className="bt-btn bt-btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Continue →"}
            </button>
          )}
          {step === 4 && (
            <button onClick={handleStep4Next} className="bt-btn bt-btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Continue →"}
            </button>
          )}
          {step === 5 && (
            <button onClick={handleStep5Next} className="bt-btn bt-btn-primary" disabled={saving}>
              {saving ? "Saving..." : "Continue →"}
            </button>
          )}
          {step === 6 && (
            <button onClick={() => go(7)} className="bt-btn bt-btn-primary" disabled={saving}>
              Next →
            </button>
          )}
          {step === 7 && scanStatus !== "running" && (
            <button
              onClick={handleFinish}
              className="bt-btn bt-btn-primary"
              disabled={saving}
            >
              {scanStatus === "done"
                ? "Go to Dashboard →"
                : saving
                ? "Finishing..."
                : "Finish Setup →"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small helpers

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "18px",
  fontWeight: 700,
  color: "var(--text-primary)",
  letterSpacing: "-0.3px",
  marginBottom: "6px",
};

const subStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
  marginBottom: "18px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--text-tertiary)",
  marginBottom: "6px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string | undefined }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span style={{ fontSize: "12px", width: "18px" }}>{icon}</span>
      <span style={{ fontSize: "11px", color: "var(--text-muted)", width: "70px" }}>{label}</span>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>{value || "—"}</span>
    </div>
  );
}
