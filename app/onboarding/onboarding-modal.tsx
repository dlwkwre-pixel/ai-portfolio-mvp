"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STARTER_STRATEGIES } from "./config";
import { BrandGlyph } from "@/app/components/brand-mark";

async function apiPost(path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  return { ok: res.ok, data };
}

type Portfolio = { id: string; name: string; account_type: string | null; cash_balance: number };
type Strategy = { id: string; name: string; description: string | null; risk_level: string | null };
type DraftHolding = { ticker: string; shares: string; costBasis: string };
type FinnMessage = { role: "user" | "assistant"; content: string };
type FinnGenerated = {
  name: string; description: string; style: string; risk_level: string;
  prompt_text: string; max_position_pct: number; min_position_pct: number;
  cash_min_pct: number; cash_max_pct: number; turnover_preference: string;
  holding_period_bias: string;
};

const FV = {
  bg: "rgba(109,40,217,0.05)",
  bgMed: "rgba(109,40,217,0.09)",
  border: "rgba(109,40,217,0.18)",
  accent: "#7c3aed",
  accentBright: "#8b5cf6",
} as const;

const TOTAL_STEPS = 7;

// The 7 steps group into a 3-phase arc so users can see the whole "get set up"
// journey at a glance (step 1 is the intro / welcome).
const PHASES: { label: string; steps: number[] }[] = [
  { label: "Portfolio", steps: [2, 3, 4] },
  { label: "Strategy", steps: [5] },
  { label: "AI insights", steps: [6, 7] },
];

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
  onClose,
}: {
  initialStep: number;
  existingPortfolios: Portfolio[];
  existingStrategies: Strategy[];
  onClose: () => void;
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
  const [strategyTab, setStrategyTab] = useState<"starter" | "custom" | "existing" | "finn">(
    existingStrategies.length > 0 ? "existing" : "starter"
  );
  const [selectedStarterIdx, setSelectedStarterIdx] = useState(0);
  const [customRisk, setCustomRisk] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [customHorizon, setCustomHorizon] = useState<"short" | "medium" | "long">("medium");
  const [customStyle, setCustomStyle] = useState("balanced");
  const [selectedExistingId, setSelectedExistingId] = useState(existingStrategies[0]?.id ?? "");
  const [strategySaved, setStrategySaved] = useState(false);

  // ── Step 5: Atlas
  const [finnMessages, setFinnMessages] = useState<FinnMessage[]>([]);
  const [finnInput, setFinnInput] = useState("");
  const [finnThinking, setFinnThinking] = useState(false);
  const [finnGenerated, setFinnGenerated] = useState<FinnGenerated | null>(null);
  const [finnError, setFinnError] = useState<string | null>(null);
  const [finnStarted, setFinnStarted] = useState(false);

  // ── Step 7: Scan
  const [scanStatus, setScanStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Helpers

  function dismiss() {
    onClose();
    router.refresh();
  }

  async function go(nextStep: number, saveStatus?: "in_progress" | "completed" | "skipped") {
    setError(null);
    setSaving(true);
    try {
      await apiPost("/api/onboarding/progress", { step: nextStep, status: saveStatus ?? "in_progress" });
    } catch {
      // Non-critical — best effort
    } finally {
      setStep(nextStep);
      setSaving(false);
    }
  }

  async function handleSkipAll() {
    setSaving(true);
    try { await apiPost("/api/onboarding/progress", { step, status: "skipped" }); } catch {}
    setSaving(false);
    dismiss();
  }

  async function handleFinish() {
    setSaving(true);
    try { await apiPost("/api/onboarding/progress", { step: TOTAL_STEPS, status: "completed" }); } catch {}
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
        const selected = existingPortfolios.find((p) => p.id === portfolioId);
        if (selected) setCash(String(selected.cash_balance ?? 0));
        await go(3);
      } else {
        if (!portfolioName.trim()) throw new Error("Portfolio name is required.");
        const res = await fetch("/api/onboarding/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: portfolioName.trim(), account_type: accountType }),
        });
        const result = await res.json() as { id?: string; error?: string };
        if (!res.ok || result.error) throw new Error(result.error || "Failed to create portfolio");
        setPortfolioId(result.id ?? "");
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
        const { ok, data } = await apiPost("/api/onboarding/holdings", {
          portfolio_id: portfolioId,
          holdings: draftHoldings.map((h) => ({
            ticker: h.ticker,
            shares: parseFloat(h.shares),
            average_cost_basis: parseFloat(h.costBasis),
          })),
        });
        if (!ok) throw new Error((data.error as string) || "Failed to save holdings");
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
        const { ok, data } = await apiPost("/api/onboarding/cash", {
          portfolio_id: portfolioId,
          cash_amount: cashNum,
        });
        if (!ok) throw new Error((data.error as string) || "Failed to save cash");
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
      let payload: Record<string, unknown>;
      if (strategyTab === "existing" && selectedExistingId) {
        payload = { portfolio_id: portfolioId, mode: "assign", strategy_id: selectedExistingId };
      } else if (strategyTab === "finn" && finnGenerated) {
        const riskNorm = finnGenerated.risk_level.toLowerCase();
        const turnoverNorm = finnGenerated.turnover_preference.toLowerCase();
        const horizonNorm = finnGenerated.holding_period_bias.toLowerCase().replace(/[\s-]+/g, "_").replace("very_long_term", "long_term");
        payload = {
          portfolio_id: portfolioId, mode: "create",
          strategy: {
            name: finnGenerated.name, description: finnGenerated.description,
            style: finnGenerated.style.toLowerCase(), risk_level: riskNorm,
            prompt_text: finnGenerated.prompt_text,
            max_position_pct: finnGenerated.max_position_pct,
            min_position_pct: finnGenerated.min_position_pct,
            cash_min_pct: finnGenerated.cash_min_pct,
            cash_max_pct: finnGenerated.cash_max_pct,
            turnover_preference: turnoverNorm, holding_period_bias: horizonNorm,
          },
        };
      } else if (strategyTab === "starter") {
        const s = STARTER_STRATEGIES[selectedStarterIdx];
        payload = { portfolio_id: portfolioId, mode: "create", strategy: s };
      } else if (strategyTab === "finn") {
        // Atlas started but hasn't generated yet — skip
        await go(6);
        return;
      } else {
        const riskMap: Record<string, { max: number; cashMax: number; turnover: string }> = {
          conservative: { max: 10, cashMax: 10, turnover: "low" },
          moderate: { max: 15, cashMax: 15, turnover: "medium" },
          aggressive: { max: 20, cashMax: 20, turnover: "high" },
        };
        const horizonMap: Record<string, string> = {
          short: "short_term", medium: "medium_term", long: "long_term",
        };
        const rm = riskMap[customRisk];
        payload = {
          portfolio_id: portfolioId,
          mode: "create",
          strategy: {
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
          },
        };
      }
      const { ok, data } = await apiPost("/api/onboarding/strategy", payload);
      if (!ok) throw new Error((data.error as string) || "Failed to save strategy");
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
      const { ok, data } = await apiPost("/api/onboarding/scan", { portfolio_id: portfolioId });
      if (!ok) throw new Error((data.error as string) || "AI scan failed");
      setScanStatus("done");
    } catch (e) {
      setScanStatus("error");
      setScanError(e instanceof Error ? e.message : "AI scan failed. You can run it later from the portfolio page.");
    }
  }

  // ── Atlas functions

  async function startFinn() {
    if (finnStarted) return;
    setFinnStarted(true);
    setFinnThinking(true);
    setFinnError(null);
    try {
      const res = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [], phase: "chat" }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Atlas failed to start");
      const reply = (data.text ?? "").replace(/READY_TO_GENERATE/g, "").trim();
      setFinnMessages([{ role: "assistant", content: reply }]);
    } catch (e) {
      setFinnError(e instanceof Error ? e.message : "Atlas failed to start. Try again.");
      setFinnStarted(false);
    } finally {
      setFinnThinking(false);
    }
  }

  async function sendFinnMessage(text: string) {
    if (!text.trim() || finnThinking) return;
    const userMsg: FinnMessage = { role: "user", content: text.trim() };
    const next = [...finnMessages, userMsg];
    setFinnMessages(next);
    setFinnInput("");
    setFinnThinking(true);
    setFinnError(null);
    try {
      const res = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, phase: "chat" }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Atlas error");
      const reply = data.text ?? "";
      const withReply = [...next, { role: "assistant" as const, content: reply }];
      setFinnMessages(withReply);
      if (reply.includes("READY_TO_GENERATE")) {
        await generateFinnStrategy(withReply);
      }
    } catch (e) {
      setFinnError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setFinnThinking(false);
    }
  }

  async function generateFinnStrategy(msgs: FinnMessage[]) {
    setFinnThinking(true);
    try {
      const res = await fetch("/api/strategies/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs, phase: "generate" }),
      });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Generation failed");
      const raw = (data.text ?? "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(raw) as FinnGenerated;
      setFinnGenerated(parsed);
    } catch (e) {
      setFinnError(e instanceof Error ? e.message : "Strategy generation failed. Try again.");
    } finally {
      setFinnThinking(false);
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
          @keyframes obArtIn {
            from { opacity: 0; transform: translateY(8px) scale(0.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes obArtGlyph {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .ob-art { animation: obArtIn 0.42s cubic-bezier(0.16,1,0.3,1) both; }
          .ob-art > svg { animation: obArtGlyph 0.5s ease 0.12s both; }
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

        {/* Phase map — shows the whole arc: Portfolio → Strategy → AI insights */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "12px 20px 0", flexShrink: 0 }}>
          {PHASES.map((phase, i) => {
            const isComplete = phase.steps.every((s) => s < step);
            const isCurrent = phase.steps.includes(step);
            const accent = isComplete ? "var(--green)" : isCurrent ? "var(--brand-blue)" : "var(--text-muted)";
            return (
              <div key={phase.label} style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)",
                  color: isComplete ? "#fff" : isCurrent ? "#fff" : "var(--text-muted)",
                  background: isComplete ? "var(--green)" : isCurrent ? "var(--brand-blue)" : "var(--card-bg)",
                  border: `1px solid ${isComplete ? "var(--green)" : isCurrent ? "var(--brand-blue)" : "var(--card-border)"}`,
                  transition: "all 0.3s ease",
                }}>
                  {isComplete ? (
                    <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                  ) : i + 1}
                </div>
                <span style={{
                  fontSize: "11px", fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? "var(--text-primary)" : isComplete ? "var(--text-secondary)" : "var(--text-muted)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  transition: "color 0.3s ease",
                }}>
                  {phase.label}
                </span>
                {i < PHASES.length - 1 && (
                  <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)", minWidth: "8px" }} />
                )}
              </div>
            );
          })}
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
              <BrandGlyph size={13} strokeWidth={3.2} />
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
              <div style={{ marginBottom: "20px" }}>
                <StepArt kind="welcome" />
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
              <StepHeader
                kind="portfolio"
                title="Create your portfolio"
                sub="Name it and pick the account type. This is the home for your holdings, cash, and AI insights."
                unlocks="A place to track your investments"
              />

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
              <StepHeader
                kind="holdings"
                title="Add your current holdings"
                sub="Enter what you already own — ticker, shares, average cost. Skip it and add later if you prefer."
                unlocks="The AI analyzes your real positions"
              />

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
              <StepHeader
                kind="cash"
                title="How much cash is available?"
                sub="Uninvested cash in this portfolio. The AI uses it to size buy recommendations."
                unlocks="Right-sized buy suggestions"
              />
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
              <StepHeader
                kind="strategy"
                title="Choose your strategy"
                sub="It defines how you invest and guides every AI recommendation. Pick a ready-made one, let Atlas build it, or define your own."
                unlocks="Advice tailored to your style"
              />

              {/* Tabs */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
                {(["starter", "custom", ...(existingStrategies.length > 0 ? ["existing"] : []), "finn"] as Array<typeof strategyTab>).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setStrategyTab(tab); if (tab === "finn") startFinn(); }}
                    className={strategyTab === tab ? "bt-btn bt-btn-primary bt-btn-sm" : "bt-btn bt-btn-ghost bt-btn-sm"}
                    style={tab === "finn" && strategyTab !== "finn" ? { borderColor: FV.border, color: FV.accentBright } : {}}
                  >
                    {tab === "starter" ? "Starter templates" : tab === "custom" ? "Build custom" : tab === "existing" ? "My strategies" : "✦ Build with Atlas"}
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

              {/* Atlas chat tab */}
              {strategyTab === "finn" && (
                <div>
                  <style>{`
                    @keyframes finnDot {
                      0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
                      40% { opacity: 1; transform: scale(1); }
                    }
                  `}</style>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", padding: "9px 12px", background: FV.bg, border: `1px solid ${FV.border}`, borderRadius: "10px" }}>
                    <div style={{ width: "22px", height: "22px", flexShrink: 0, background: "linear-gradient(135deg, #6d28d9, #8b5cf6)", borderRadius: "5px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, color: "#fff" }}>A</div>
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: FV.accentBright }}>Atlas Strategy Builder</div>
                      <div style={{ fontSize: "10px", color: "rgba(167,139,250,0.55)" }}>Personalized strategy through conversation — 5 to 7 exchanges</div>
                    </div>
                  </div>

                  {!finnStarted && !finnThinking && finnMessages.length === 0 && (
                    <div style={{ textAlign: "center", padding: "20px 12px", background: FV.bg, border: `1px dashed ${FV.border}`, borderRadius: "10px", marginBottom: "12px" }}>
                      <p style={{ fontSize: "11px", color: "rgba(167,139,250,0.65)", marginBottom: "12px", lineHeight: 1.5 }}>
                        Atlas will ask you a few questions to build a strategy tailored specifically to how you invest.
                      </p>
                      <button onClick={startFinn} style={{ background: FV.bgMed, color: FV.accentBright, border: `1px solid ${FV.border}`, borderRadius: "8px", padding: "6px 14px", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>
                        Start conversation ✦
                      </button>
                    </div>
                  )}

                  {(finnStarted || finnMessages.length > 0) && (
                    <div style={{ maxHeight: "210px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "7px", padding: "10px", background: FV.bg, border: `1px solid ${FV.border}`, borderRadius: "10px", marginBottom: "10px" }}>
                      {finnMessages.map((msg, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                          <div style={{
                            maxWidth: "86%", padding: "6px 10px",
                            borderRadius: msg.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                            background: msg.role === "user" ? "rgba(37,99,235,0.18)" : FV.bgMed,
                            border: `1px solid ${msg.role === "user" ? "rgba(37,99,235,0.28)" : FV.border}`,
                            fontSize: "11px", lineHeight: 1.5, whiteSpace: "pre-wrap",
                            color: msg.role === "user" ? "rgba(191,219,254,0.9)" : "rgba(221,214,254,0.88)",
                          }}>
                            {msg.content.replace(/READY_TO_GENERATE/g, "").trim()}
                          </div>
                        </div>
                      ))}
                      {finnThinking && (
                        <div style={{ display: "flex", justifyContent: "flex-start" }}>
                          <div style={{ padding: "8px 12px", borderRadius: "10px 10px 10px 2px", background: FV.bgMed, border: `1px solid ${FV.border}`, display: "flex", gap: "4px", alignItems: "center" }}>
                            {[0, 1, 2].map((d) => (
                              <div key={d} style={{ width: "4px", height: "4px", borderRadius: "50%", background: FV.accentBright, animation: `finnDot 1.2s ${d * 0.2}s ease-in-out infinite` }} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {finnError && (
                    <div style={{ padding: "8px 12px", background: "rgba(255,92,92,0.08)", border: "1px solid rgba(255,92,92,0.2)", borderRadius: "8px", fontSize: "11px", color: "var(--red)", marginBottom: "10px" }}>
                      {finnError}
                    </div>
                  )}

                  {finnStarted && !finnGenerated && (
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        className="bt-input"
                        value={finnInput}
                        onChange={(e) => setFinnInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendFinnMessage(finnInput); } }}
                        placeholder="Reply to Atlas..."
                        disabled={finnThinking}
                        style={{ flex: 1, fontSize: "12px" }}
                      />
                      <button
                        onClick={() => void sendFinnMessage(finnInput)}
                        disabled={finnThinking || !finnInput.trim()}
                        className="bt-btn bt-btn-primary bt-btn-sm"
                        style={{ flexShrink: 0, paddingLeft: "14px", paddingRight: "14px" }}
                      >
                        →
                      </button>
                    </div>
                  )}

                  {finnGenerated && (
                    <div style={{ padding: "12px 14px", background: FV.bgMed, border: `1px solid ${FV.border}`, borderRadius: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: FV.accentBright }}>{finnGenerated.name}</div>
                        <RiskBadge level={finnGenerated.risk_level.toLowerCase()} />
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(221,214,254,0.72)", lineHeight: 1.5, marginBottom: "8px" }}>
                        {finnGenerated.description}
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {[
                          { label: "Style", value: finnGenerated.style },
                          { label: "Turnover", value: finnGenerated.turnover_preference },
                          { label: "Horizon", value: finnGenerated.holding_period_bias },
                        ].map((item) => (
                          <div key={item.label} style={{ padding: "3px 8px", background: FV.bg, border: `1px solid ${FV.border}`, borderRadius: "6px" }}>
                            <span style={{ fontSize: "10px", color: "rgba(167,139,250,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}: </span>
                            <span style={{ fontSize: "10px", color: "rgba(196,181,253,0.85)" }}>{item.value}</span>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: "10px", color: "rgba(167,139,250,0.45)", marginTop: "8px", marginBottom: 0 }}>
                        ✦ Strategy built by Atlas — click Continue to save it.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Atlas note — shown for all other tabs */}
              {strategyTab !== "finn" && (
              <div style={{
                marginTop: "14px", padding: "9px 12px",
                background: "rgba(109,40,217,0.06)", border: "1px solid rgba(109,40,217,0.18)",
                borderRadius: "8px", display: "flex", alignItems: "flex-start", gap: "8px",
              }}>
                <span style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }}>✦</span>
                <p style={{ fontSize: "11px", color: "rgba(167,139,250,0.9)", lineHeight: 1.5, margin: 0 }}>
                  Once saved, Atlas will score your strategy, explain its thesis, surface weaknesses, and build your investor profile as you add more strategies.
                </p>
              </div>
              )}
            </div>
          )}

          {/* ── Step 6: AI + Atlas Tutorial */}
          {step === 6 && (
            <div>
              <StepHeader
                kind="insights"
                title="Your AI-powered edge"
                sub="Every recommendation is a clear call — BUY, HOLD, TRIM — with a thesis, conviction, and sizing, using live market data."
              />

              {/* Section: AI Recommendations */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{
                  fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "8px",
                }}>
                  Portfolio Recommendations
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {[
                    {
                      icon: "🧠",
                      title: "Context-aware",
                      body: "Uses your holdings, cash balance, and strategy to generate personalized picks — not generic market calls.",
                    },
                    {
                      icon: "📋",
                      title: "Actionable signals",
                      body: "Each rec comes with an action (BUY, ADD, TRIM, SELL, HOLD, WATCH), a thesis, conviction level, and suggested sizing.",
                    },
                    {
                      icon: "⚡",
                      title: "Live data via Grok",
                      body: "Powered by live web and market search so recommendations reflect current prices, earnings, and news.",
                    },
                  ].map((item) => (
                    <div key={item.title} style={{
                      padding: "10px 12px",
                      background: "var(--card-bg)", border: "1px solid var(--card-border)",
                      borderRadius: "9px",
                      display: "flex", gap: "10px",
                    }}>
                      <span style={{ fontSize: "15px", flexShrink: 0, marginTop: "1px" }}>{item.icon}</span>
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>{item.title}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.45 }}>{item.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section: Atlas Strategy Intelligence */}
              <div style={{
                padding: "12px 14px",
                background: "rgba(109,40,217,0.05)",
                border: "1px solid rgba(109,40,217,0.18)",
                borderRadius: "10px",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "7px", marginBottom: "10px",
                }}>
                  <div style={{
                    width: "20px", height: "20px",
                    background: "linear-gradient(135deg, #6d28d9, #8b5cf6)",
                    borderRadius: "5px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 700, color: "#fff",
                    letterSpacing: "-0.3px",
                  }}>A</div>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "rgba(167,139,250,1)", letterSpacing: "-0.1px" }}>
                    Atlas Strategy Intelligence
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                  {[
                    { label: "Strategy Score", detail: "Rates your strategy 0–100 across focus, discipline, clarity, and edge. Explains why." },
                    { label: "Bull / Bear Analysis", detail: "Breaks down the strongest case for and against your strategy, and flags internal contradictions." },
                    { label: "Improve Strategy", detail: "Suggests concrete parameter tweaks to make your strategy stronger, with a before/after comparison." },
                    { label: "Strategy Comparison", detail: "Run two strategies head-to-head across 8 factors. See which wins and by how much." },
                    { label: "Investor Profile", detail: "Detects your investing archetype from your strategy history and tracks behavioral patterns over time." },
                  ].map((item) => (
                    <div key={item.label} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{
                        width: "4px", height: "4px", borderRadius: "50%",
                        background: "#7c3aed", flexShrink: 0, marginTop: "6px",
                      }} />
                      <div>
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(196,181,253,0.95)" }}>{item.label}:</span>
                        {" "}
                        <span style={{ fontSize: "11px", color: "rgba(196,181,253,0.65)", lineHeight: 1.45 }}>{item.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: "10px", color: "rgba(167,139,250,0.5)", marginTop: "10px", marginBottom: 0, lineHeight: 1.4 }}>
                  Find Atlas on every strategy card in the Strategies tab.
                </p>
              </div>

              <div style={{ padding: "8px 12px", borderRadius: "8px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5, marginTop: "10px" }}>
                BuyTune&apos;s recommendations are informational only and not financial advice. Always apply your own judgement before making investment decisions.
              </div>
            </div>
          )}

          {/* ── Step 7: First Scan */}
          {step === 7 && (
            <div>
              <StepHeader
                kind="scan"
                title="Run your first AI scan"
                sub="Atlas reviews your portfolio against your strategy and live data, then lists what to consider."
                unlocks="Your first recommendations"
              />

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
                    : strategyTab === "finn"
                    ? (finnGenerated?.name ?? "Atlas Strategy")
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

// ── Per-step SVG illustrations ──────────────────────────────────────────────
// Simple, theme-aware line diagrams (no screenshots to rot). The panel sets the
// accent via `color`; glyphs use currentColor + a few token strokes/fills.

type ArtKind = "welcome" | "portfolio" | "holdings" | "cash" | "strategy" | "insights" | "scan";

const BLUE = "var(--brand-blue)";
const VIOLET = "var(--violet)";
const GREEN = "var(--green)";

function StepArt({ kind }: { kind: ArtKind }) {
  const accent = kind === "strategy" ? VIOLET : kind === "insights" ? VIOLET : kind === "cash" ? GREEN : BLUE;
  return (
    <div className="ob-art" style={{
      height: "104px", borderRadius: "var(--radius-lg)",
      background: "var(--card-bg)", border: "1px solid var(--card-border)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", color: accent,
    }}>
      <svg width="100%" height="104" viewBox="0 0 320 104" fill="none" preserveAspectRatio="xMidYMid meet">
        {kind === "welcome" && (
          <g>
            {/* Portfolio → Strategy → AI insights mini-arc, echoing the phase map */}
            <rect x="34" y="40" width="64" height="40" rx="8" style={{ fill: "var(--bg-elevated)", stroke: BLUE }} strokeWidth="1.5" />
            <rect x="44" y="50" width="26" height="6" rx="3" style={{ fill: BLUE }} opacity="0.85" />
            <rect x="44" y="62" width="40" height="5" rx="2.5" style={{ fill: "var(--text-muted)" }} />
            <path d="M104 60h26" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 4" />
            <path d="M126 56l5 4-5 4" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="134" y="40" width="52" height="40" rx="8" style={{ fill: "var(--bg-elevated)", stroke: VIOLET }} strokeWidth="1.5" />
            <circle cx="148" cy="54" r="3" style={{ stroke: VIOLET }} strokeWidth="1.5" fill="none" />
            <rect x="156" y="51" width="22" height="5" rx="2.5" style={{ fill: "var(--text-muted)" }} />
            <rect x="148" y="63" width="30" height="5" rx="2.5" style={{ fill: "var(--text-muted)" }} opacity="0.7" />
            <path d="M192 60h26" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 4" />
            <path d="M214 56l5 4-5 4" style={{ stroke: "var(--text-muted)" }} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="222" y="40" width="64" height="40" rx="8" style={{ fill: "var(--bg-elevated)", stroke: GREEN }} strokeWidth="1.5" />
            <path d="M236 33l2.4 5.8 5.8 2.4-5.8 2.4L236 49l-2.4-5.8L228 41l5.8-2.4z" style={{ fill: GREEN }} />
            <rect x="232" y="58" width="44" height="6" rx="3" style={{ fill: GREEN }} opacity="0.5" />
            <rect x="232" y="68" width="30" height="5" rx="2.5" style={{ fill: "var(--text-muted)" }} />
          </g>
        )}
        {kind === "portfolio" && (
          <g>
            <rect x="108" y="24" width="104" height="56" rx="9" style={{ fill: "var(--bg-elevated)", stroke: "currentColor" }} strokeWidth="1.5" />
            <rect x="120" y="36" width="34" height="6" rx="3" style={{ fill: "currentColor" }} opacity="0.9" />
            <rect x="120" y="50" width="60" height="9" rx="3" style={{ fill: "var(--text-muted)" }} />
            <rect x="120" y="66" width="14" height="6" rx="3" style={{ fill: "var(--text-muted)" }} opacity="0.7" />
            <circle cx="196" cy="40" r="9" style={{ stroke: GREEN }} strokeWidth="2" fill="none" />
            <path d="M192 40l3 3 5-6" style={{ stroke: GREEN }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
        {kind === "holdings" && (
          <g>
            {[28, 50, 72].map((y, i) => (
              <g key={y}>
                <rect x="78" y={y - 9} width="164" height="18" rx="5" style={{ fill: "var(--bg-elevated)", stroke: "var(--card-border)" }} strokeWidth="1" />
                <rect x="84" y={y - 5} width="26" height="10" rx="3" style={{ fill: "currentColor" }} opacity={0.85 - i * 0.15} />
                <rect x="120" y={y - 3} width="48" height="6" rx="3" style={{ fill: "var(--text-muted)" }} />
                <rect x="210" y={y - 3} width="26" height="6" rx="3" style={{ fill: GREEN }} opacity="0.8" />
              </g>
            ))}
          </g>
        )}
        {kind === "cash" && (
          <g>
            <rect x="110" y="34" width="100" height="40" rx="8" style={{ fill: "var(--bg-elevated)", stroke: "currentColor" }} strokeWidth="1.5" />
            <circle cx="160" cy="54" r="12" style={{ stroke: "currentColor" }} strokeWidth="2" fill="none" />
            <path d="M160 48v12M157 51h4.5a2 2 0 010 4H157m0 0h5" style={{ stroke: "currentColor" }} strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="126" cy="54" r="3" style={{ fill: "var(--text-muted)" }} />
            <circle cx="194" cy="54" r="3" style={{ fill: "var(--text-muted)" }} />
          </g>
        )}
        {kind === "strategy" && (
          <g>
            <rect x="40" y="28" width="84" height="48" rx="8" style={{ fill: "var(--bg-elevated)", stroke: "currentColor" }} strokeWidth="1.5" />
            {[40, 52, 64].map((y) => (
              <g key={y}>
                <circle cx="54" cy={y} r="3" style={{ stroke: "currentColor" }} strokeWidth="1.5" fill="none" />
                <rect x="62" y={y - 3} width="46" height="6" rx="3" style={{ fill: "var(--text-muted)" }} />
              </g>
            ))}
            <path d="M132 52h48" style={{ stroke: "currentColor" }} strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" />
            <path d="M176 47l6 5-6 5" style={{ stroke: "currentColor" }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="196" y="32" width="80" height="40" rx="8" style={{ fill: "var(--bg-elevated)", stroke: GREEN }} strokeWidth="1.5" />
            <rect x="208" y="42" width="30" height="6" rx="3" style={{ fill: GREEN }} opacity="0.85" />
            <rect x="208" y="54" width="50" height="6" rx="3" style={{ fill: "var(--text-muted)" }} />
          </g>
        )}
        {kind === "insights" && (
          <g>
            <path d="M150 30l3.2 7.8 7.8 3.2-7.8 3.2L150 52l-3.2-7.8L139 41l7.8-3.2z" style={{ fill: "currentColor" }} />
            <path d="M120 66h80" style={{ stroke: "var(--card-border)" }} strokeWidth="1" />
            <g>
              <rect x="78" y="74" width="44" height="16" rx="8" style={{ fill: "var(--green-bg)", stroke: GREEN }} strokeWidth="1" />
              <text x="100" y="85" textAnchor="middle" style={{ fill: GREEN, font: "700 9px var(--font-mono)" }}>BUY</text>
              <rect x="138" y="74" width="44" height="16" rx="8" style={{ fill: "var(--card-bg)", stroke: "var(--text-muted)" }} strokeWidth="1" />
              <text x="160" y="85" textAnchor="middle" style={{ fill: "var(--text-secondary)", font: "700 9px var(--font-mono)" }}>HOLD</text>
              <rect x="198" y="74" width="44" height="16" rx="8" style={{ fill: "var(--amber-bg)", stroke: "var(--amber)" }} strokeWidth="1" />
              <text x="220" y="85" textAnchor="middle" style={{ fill: "var(--amber)", font: "700 9px var(--font-mono)" }}>TRIM</text>
            </g>
          </g>
        )}
        {kind === "scan" && (
          <g>
            <rect x="96" y="28" width="128" height="52" rx="9" style={{ fill: "var(--bg-elevated)", stroke: "var(--card-border)" }} strokeWidth="1.5" />
            <rect x="108" y="40" width="44" height="6" rx="3" style={{ fill: "var(--text-muted)" }} />
            <rect x="108" y="54" width="70" height="6" rx="3" style={{ fill: "var(--text-muted)" }} opacity="0.6" />
            <circle cx="196" cy="54" r="18" style={{ stroke: "currentColor" }} strokeWidth="2" fill="none" opacity="0.4" />
            <circle cx="196" cy="54" r="11" style={{ stroke: "currentColor" }} strokeWidth="2" fill="none" />
            <path d="M204 62l9 9" style={{ stroke: "currentColor" }} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
}

function StepHeader({ kind, title, sub, unlocks }: { kind: ArtKind; title: string; sub: string; unlocks?: string }) {
  return (
    <div style={{ marginBottom: "16px" }}>
      <StepArt kind={kind} />
      <h2 style={{ ...headingStyle, marginTop: "14px", marginBottom: "5px" }}>{title}</h2>
      <p style={{ ...subStyle, marginBottom: unlocks ? "10px" : "16px" }}>{sub}</p>
      {unlocks && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "5px 11px", borderRadius: "var(--radius-full)",
          background: "var(--green-bg)", border: "1px solid var(--green-border)",
        }}>
          <svg width="11" height="11" viewBox="0 0 20 20" fill="var(--green)"><path d="M10 1a4 4 0 00-4 4v2H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2v-7a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 6V5a2 2 0 10-4 0v2h4z" /></svg>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--green)" }}>{unlocks}</span>
        </div>
      )}
    </div>
  );
}
