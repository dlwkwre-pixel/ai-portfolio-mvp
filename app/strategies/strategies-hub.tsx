"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStrategy } from "./actions";
import { assignStrategyToPortfolio } from "@/app/portfolios/[id]/assign-strategy-actions";
import StrategyQuestionnaire from "./strategy-questionnaire";

type HubPortfolio = { id: string; name: string; account_type: string | null };

// ── Templates ────────────────────────────────────────────────────────────────

type Template = {
  id: string;
  name: string;
  badge: string | null;
  description: string;
  style: string;
  risk_level: string;
  turnover_preference: string;
  holding_period_bias: string;
  max_position_pct: number | null;
  min_position_pct: number | null;
  cash_min_pct: number | null;
  cash_max_pct: number | null;
  prompt_text: string;
};

const TEMPLATES: Template[] = [
  {
    id: "long-term-growth",
    name: "Long-Term Growth",
    badge: "Popular",
    description: "Quality companies held for years. Compounding-focused, low trading.",
    style: "Growth",
    risk_level: "Moderate",
    turnover_preference: "Low",
    holding_period_bias: "Long-term",
    max_position_pct: 15,
    min_position_pct: 3,
    cash_min_pct: 5,
    cash_max_pct: 15,
    prompt_text: "Focus on high-quality businesses with durable competitive advantages, strong free cash flow, and proven management. Hold through short-term volatility. Prioritize companies with pricing power and expanding margins.",
  },
  {
    id: "conservative-core",
    name: "Conservative Core",
    badge: "Great for beginners",
    description: "Capital preservation first. Blue chips, high cash buffer, minimal risk.",
    style: "Defensive",
    risk_level: "Conservative",
    turnover_preference: "Low",
    holding_period_bias: "Long-term",
    max_position_pct: 10,
    min_position_pct: 2,
    cash_min_pct: 15,
    cash_max_pct: 30,
    prompt_text: "Prioritize capital preservation and downside protection. Focus on dividend-paying blue chips and defensive sectors. Maintain substantial cash reserves. Avoid speculative positions and high-volatility stocks.",
  },
  {
    id: "dividend-income",
    name: "Dividend Income",
    badge: null,
    description: "High-yield dividend stocks generating steady, regular income.",
    style: "Dividend / Income",
    risk_level: "Conservative",
    turnover_preference: "Low",
    holding_period_bias: "Very Long-term",
    max_position_pct: 12,
    min_position_pct: 3,
    cash_min_pct: 5,
    cash_max_pct: 15,
    prompt_text: "Select companies with strong dividend track records, sustainable payout ratios below 70%, and dividend growth history. Prioritize Dividend Aristocrats and companies with strong balance sheets and consistent cash flow.",
  },
  {
    id: "roth-ira-growth",
    name: "Roth IRA Growth",
    badge: "Tax-optimized",
    description: "Long-horizon tax-free compounding built for retirement accounts.",
    style: "Growth",
    risk_level: "Moderate",
    turnover_preference: "Low",
    holding_period_bias: "Very Long-term",
    max_position_pct: 20,
    min_position_pct: 5,
    cash_min_pct: 5,
    cash_max_pct: 10,
    prompt_text: "Optimize for long-term tax-free growth. Focus on high-quality growth companies with 10+ year outlooks. Minimize taxable events by holding winners long-term. Target secular growth themes: AI, healthcare innovation, cloud infrastructure.",
  },
  {
    id: "value-investing",
    name: "Value Investing",
    badge: null,
    description: "Undervalued companies trading below intrinsic value. Patient, contrarian.",
    style: "Value",
    risk_level: "Moderate",
    turnover_preference: "Low",
    holding_period_bias: "Long-term",
    max_position_pct: 15,
    min_position_pct: 4,
    cash_min_pct: 10,
    cash_max_pct: 25,
    prompt_text: "Identify companies trading at a significant discount to intrinsic value. Focus on P/E, P/B, and free cash flow yield. Require a margin of safety of at least 30%. Hold cash when opportunities are scarce. Patient, contrarian approach.",
  },
  {
    id: "balanced",
    name: "Balanced 60/40",
    badge: "Classic",
    description: "Traditional mix of growth equities and income assets. Steady and proven.",
    style: "Balanced",
    risk_level: "Moderate",
    turnover_preference: "Low",
    holding_period_bias: "Long-term",
    max_position_pct: 10,
    min_position_pct: 2,
    cash_min_pct: 5,
    cash_max_pct: 20,
    prompt_text: "Maintain roughly 60% equities (quality large-caps) and 40% income-generating assets. Rebalance quarterly. Prioritize stability and moderate returns over maximum growth. Diversify across sectors and asset classes.",
  },
  {
    id: "aggressive-growth",
    name: "Aggressive Growth",
    badge: "Higher risk",
    description: "High-conviction bets on fast-growing companies. Accept volatility for upside.",
    style: "Growth",
    risk_level: "Aggressive",
    turnover_preference: "Moderate",
    holding_period_bias: "Medium-term",
    max_position_pct: 25,
    min_position_pct: 5,
    cash_min_pct: 0,
    cash_max_pct: 10,
    prompt_text: "Seek companies with hypergrowth potential: revenue growing 30%+ annually, large addressable markets, and category leadership. Accept higher volatility. Concentrate in highest-conviction ideas. Cut losses decisively at -25% from entry.",
  },
  {
    id: "etf-index",
    name: "ETF & Index Focus",
    badge: "Great for beginners",
    description: "Broad diversification through low-cost index funds. Simple and effective.",
    style: "Index / Passive",
    risk_level: "Moderate",
    turnover_preference: "Low",
    holding_period_bias: "Very Long-term",
    max_position_pct: 30,
    min_position_pct: 5,
    cash_min_pct: 5,
    cash_max_pct: 10,
    prompt_text: "Focus on broad market index ETFs for core exposure. Minimize individual stock risk. Use factor ETFs for tilts. Keep expense ratios low. Prioritize regular automatic contributions. Never sell during market downturns.",
  },
];

// Featured templates shown inline (always visible, no click needed)
const FEATURED_TEMPLATE_IDS = ["long-term-growth", "conservative-core", "roth-ira-growth", "dividend-income"];

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ = [
  { q: "What is a strategy in BuyTune?", a: "A strategy is a set of rules that guides how the AI analyzes and manages your portfolio. It defines your risk tolerance, trading frequency, holding periods, and investing philosophy." },
  { q: "How does the AI use my strategy?", a: "When you run AI analysis on a portfolio, the AI reads your strategy's instructions and parameters to tailor its recommendations. A conservative strategy produces very different advice than an aggressive one." },
  { q: "Can I have multiple strategies?", a: "Yes. Create different strategies for different goals: one for a growth-focused brokerage account, another for a conservative retirement account. Each portfolio can reference a different strategy." },
  { q: "What's the difference between templates and Atlas?", a: "Templates are pre-built starting points you can customize immediately. Atlas interviews you about your personal goals and constructs a strategy from scratch based on your answers." },
  { q: "What do the parameters mean?", a: "Max single holding caps how much of your portfolio can be in one position. Trading frequency controls how often the AI suggests rebalancing. Time horizon reflects how long you plan to hold positions before reviewing." },
];

// ── Form helpers ───────────────────────────────────────────────────────────────

const STRATEGY_STYLES = ["Growth","Value","Blend","Dividend / Income","Quality","Index / Passive","Sector / Thematic","Momentum","Swing","Mean Reversion","Defensive","Balanced","Speculative","Custom"];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFS = ["Low", "Moderate", "High"];
const HOLDING_BIASES = ["Short-term","Swing","Medium-term","Long-term","Very Long-term","Flexible"];

const inp = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const sel = "w-full rounded-xl border border-white/10 bg-(--bg-base) px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const lbl = "mb-2 block text-[11px] font-medium uppercase tracking-wide text-slate-500 leading-tight";

function badgeStyle(badge: string | null) {
  if (!badge) return null;
  if (badge === "Higher risk") return { color: "var(--red)", bg: "var(--red-bg)", border: "var(--red-border)" };
  if (badge === "Popular") return { color: "var(--brand-blue)", bg: "rgba(37,99,235,0.1)", border: "rgba(37,99,235,0.2)" };
  if (badge === "Tax-optimized") return { color: "var(--green)", bg: "var(--green-bg)", border: "var(--green-border)" };
  return { color: "var(--text-muted)", bg: "var(--card-bg)", border: "var(--card-border)" };
}

// ── Chip helper ───────────────────────────────────────────────────────────────

function Chip({ label }: { label: string }) {
  return (
    <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "var(--radius-full)", background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-muted)" }}>
      {label}
    </span>
  );
}

// ── Animation keyframes ───────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes flyCardIn {
  from { opacity: 0; transform: translateX(-50%) scale(0.8) translateY(-20px); }
  to   { opacity: 1; transform: translateX(-50%) scale(1)   translateY(0); }
}
@keyframes flyCardDown {
  0%   { opacity: 1; transform: translateX(-50%) scale(1)    translateY(0); }
  20%  { opacity: 1; transform: translateX(-50%) scale(0.97) translateY(12px); }
  100% { opacity: 0; transform: translateX(-50%) scale(0.78) translateY(62vh); }
}
@keyframes nudgeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.featured-templates-scroll::-webkit-scrollbar { display: none; }
.featured-templates-scroll { -ms-overflow-style: none; scrollbar-width: none; }
@media (max-width: 640px) {
  .strategies-hub-grid { grid-template-columns: 1fr !important; }
  .templates-grid { grid-template-columns: 1fr !important; }
  .manual-form-grid { grid-template-columns: 1fr !important; }
}
@media (max-width: 768px) {
  /* Popular starting points stack vertically instead of horizontal scroll */
  .featured-templates-scroll { flex-direction: column !important; overflow-x: visible !important; }
  .featured-templates-scroll > * { width: 100% !important; flex-shrink: 1 !important; }
}
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function StrategiesHub({ portfolios = [] }: { portfolios?: HubPortfolio[] }) {
  const router = useRouter();
  // One builder, three methods. Default to Atlas (the recommended path).
  const [method, setMethod] = useState<"ai-builder" | "templates" | "custom">("ai-builder");
  const [showAllTemplates, setShowAllTemplates] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [manualError, setManualError] = useState("");
  const [isManualPending, startManual] = useTransition();
  const [showFinn, setShowFinn] = useState(false);

  // Assign-on-create: after any method builds a strategy, offer to apply it to a
  // portfolio right here instead of sending the user to the Portfolios page.
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [assignTarget, setAssignTarget] = useState<string>(portfolios[0]?.id ?? "");
  const [assignedTo, setAssignedTo] = useState<HubPortfolio | null>(null);
  const [assignError, setAssignError] = useState("");
  const [isAssignPending, startAssign] = useTransition();

  const featuredTemplates = TEMPLATES.filter(t => FEATURED_TEMPLATE_IDS.includes(t.id));

  function onStrategyCreated(id: string | undefined, name: string) {
    setAssignedTo(null);
    setAssignError("");
    setAssignTarget(portfolios[0]?.id ?? "");
    setCreated(id ? { id, name } : null);
    router.refresh(); // refresh the strategy list below
    if (!id) return;
    // Scroll the confirmation into view (it renders at the top of the hub).
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleAssign() {
    if (!created || !assignTarget) return;
    setAssignError("");
    startAssign(async () => {
      try {
        const fd = new FormData();
        fd.set("portfolio_id", assignTarget);
        fd.set("strategy_id", created.id);
        await assignStrategyToPortfolio(fd);
        const p = portfolios.find(x => x.id === assignTarget) ?? null;
        setAssignedTo(p);
        router.refresh();
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : "Could not apply the strategy.");
      }
    });
  }

  async function handleUseTemplate(t: Template) {
    setCreatingTemplate(t.id);
    setTemplateError("");
    try {
      const fd = new FormData();
      fd.set("name", t.name);
      fd.set("description", t.description);
      fd.set("style", t.style);
      fd.set("risk_level", t.risk_level);
      fd.set("turnover_preference", t.turnover_preference);
      fd.set("holding_period_bias", t.holding_period_bias);
      fd.set("max_position_pct", t.max_position_pct?.toString() ?? "");
      fd.set("min_position_pct", t.min_position_pct?.toString() ?? "");
      fd.set("cash_min_pct", t.cash_min_pct?.toString() ?? "");
      fd.set("cash_max_pct", t.cash_max_pct?.toString() ?? "");
      fd.set("prompt_text", t.prompt_text);
      const res = await createStrategy(fd);
      setCreatingTemplate(null);
      setShowAllTemplates(false);
      onStrategyCreated(res?.id, t.name);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Failed to create strategy.");
      setCreatingTemplate(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <style>{KEYFRAMES}</style>

      {/* ── Assign-on-create: link the new strategy to a portfolio inline ── */}
      {created && (
        <div style={{
          background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.22)",
          borderRadius: "var(--radius-xl)", padding: "16px 18px",
          animation: "nudgeIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards",
        }}>
          {assignedTo ? (
            // ── Applied ──
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "var(--green-bg)", border: "1px solid var(--green-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="var(--green)"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  &ldquo;{created.name}&rdquo; is now guiding {assignedTo.name}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                  Run an AI analysis on that portfolio to get recommendations based on it.
                </div>
              </div>
              <a href={`/portfolios/${assignedTo.id}`} style={{ fontSize: "12px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", borderRadius: "var(--radius-xl)", padding: "7px 14px", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
                Open portfolio →
              </a>
              <button type="button" onClick={() => setCreated(null)} style={{ fontSize: "12px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>Done</button>
            </div>
          ) : portfolios.length > 0 ? (
            // ── Choose a portfolio to apply to ──
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="rgba(96,165,250,0.95)"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>&ldquo;{created.name}&rdquo; created</div>
                  <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>Apply it to a portfolio so the AI uses it when analyzing.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", paddingLeft: "40px" }}>
                <select
                  value={assignTarget}
                  onChange={(e) => setAssignTarget(e.target.value)}
                  className={sel}
                  style={{ width: "auto", minWidth: "200px", flex: "0 1 auto", background: "var(--bg-card)", color: "var(--text-primary)" }}
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={isAssignPending || !assignTarget}
                  style={{ padding: "8px 16px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", cursor: "pointer", opacity: isAssignPending ? 0.6 : 1, whiteSpace: "nowrap" }}
                >
                  {isAssignPending ? "Applying…" : "Apply to portfolio"}
                </button>
                <button type="button" onClick={() => setCreated(null)} style={{ fontSize: "12px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>Not now</button>
              </div>
              {assignError && (
                <div style={{ fontSize: "12px", color: "var(--red)", paddingLeft: "40px" }}>{assignError}</div>
              )}
            </div>
          ) : (
            // ── No portfolios yet ──
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "9px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 20 20" fill="rgba(96,165,250,0.95)"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>&ldquo;{created.name}&rdquo; created</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>Create a portfolio to put this strategy to work.</div>
              </div>
              <a href="/portfolios" style={{ fontSize: "12px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", borderRadius: "var(--radius-xl)", padding: "7px 14px", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
                Create a portfolio →
              </a>
              <button type="button" onClick={() => setCreated(null)} style={{ fontSize: "12px", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}>Done</button>
            </div>
          )}
        </div>
      )}

      {/* ── Creation zone ─────────────────────────────────────────────── */}
      <section>
        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px" }}>
          Build a strategy
        </p>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "12px", maxWidth: "60ch" }}>
          A strategy guides how the AI analyzes a portfolio. You only need one to start — pick how you&apos;d like to build it.
        </p>

        {/* Method toggle — same destination, three ways to get there */}
        <div style={{ display: "inline-flex", gap: "4px", padding: "4px", borderRadius: "var(--radius-xl)", background: "var(--card-bg)", border: "1px solid var(--card-border)", marginBottom: "14px", flexWrap: "wrap" }}>
          {([
            { id: "ai-builder", label: "Let Atlas build it", badge: "Recommended" },
            { id: "templates", label: "Start from a template", badge: null },
            { id: "custom", label: "Build it myself", badge: null },
          ] as const).map((m) => {
            const active = method === m.id;
            return (
              <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "7px 14px", borderRadius: "var(--radius-lg)",
                  fontSize: "12px", fontWeight: 600, fontFamily: "var(--font-body)",
                  cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s",
                  border: active ? "1px solid rgba(37,99,235,0.4)" : "1px solid transparent",
                  background: active ? "rgba(37,99,235,0.12)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                }}>
                {m.label}
                {m.badge && (
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", color: active ? "rgba(96,165,250,0.95)" : "var(--text-muted)" }}>{m.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Atlas body ── */}
        {method === "ai-builder" && (
          <div className="bt-card" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "11px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.28)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="rgba(96,165,250,0.95)">
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginBottom: "4px" }}>Atlas, your AI strategy advisor</div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.55, margin: "0 0 12px", maxWidth: "52ch" }}>
                  Answer a few quick questions about your goals and risk. Atlas sets your position sizing and cash rules and writes the AI instruction prompt for you. About 60 seconds.
                </p>
                <button type="button" onClick={() => setShowFinn(true)}
                  style={{ padding: "9px 18px", borderRadius: "var(--radius-xl)", fontSize: "13px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg, #2563eb, #4f46e5)", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  Start with Atlas
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" /></svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Custom expand — directly under cards ─────────────────── */}
        <div style={{ display: "grid", gridTemplateRows: method === "custom" ? "1fr" : "0fr", transition: "grid-template-rows 0.36s cubic-bezier(0.16,1,0.3,1)", marginTop: method === "custom" ? "10px" : "0" }}>
          <div style={{ overflow: "hidden" }}>
            <div className="bt-card" style={{ padding: "18px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "14px" }}>Build a custom strategy</p>
              <form
                style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "16px 12px" }}
                className="manual-form-grid"
                action={(fd) => {
                  setManualError("");
                  startManual(async () => {
                    try {
                      const name = (fd.get("name") as string) || "New Strategy";
                      const res = await createStrategy(fd);
                      onStrategyCreated(res?.id, name);
                    } catch (err) {
                      setManualError(err instanceof Error ? err.message : "Something went wrong.");
                    }
                  });
                }}
              >
                <div>
                  <label className={lbl}>Strategy name *</label>
                  <input aria-label="My Strategy" name="name" type="text" placeholder="My Strategy" className={inp} required />
                </div>
                <div>
                  <label className={lbl}>Style</label>
                  <select name="style" defaultValue="Growth" className={sel}>
                    {STRATEGY_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Risk level</label>
                  <select name="risk_level" defaultValue="Moderate" className={sel}>
                    {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Trading frequency</label>
                  <select name="turnover_preference" defaultValue="Moderate" className={sel}>
                    {TURNOVER_PREFS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Time horizon</label>
                  <select name="holding_period_bias" defaultValue="Long-term" className={sel}>
                    {HOLDING_BIASES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Max single holding %</label>
                  <input aria-label="15" name="max_position_pct" type="number" step="1" min="0" max="100" placeholder="15" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Keep in cash (min) %</label>
                  <input name="cash_min_pct" type="number" step="1" min="0" placeholder="5" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Keep in cash (max) %</label>
                  <input aria-label="20" name="cash_max_pct" type="number" step="1" min="0" placeholder="20" className={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={lbl}>Description</label>
                  <textarea aria-label="A brief description of this strategy's focus." name="description" placeholder="A brief description of this strategy's focus." className={`${inp} min-h-[56px]`} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={lbl}>AI instructions</label>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "5px" }}>
                    Sent to the AI when analyzing portfolios using this strategy.
                  </p>
                  <textarea aria-label="Prioritize quality growth companies with durable moats" name="prompt_text" placeholder="Prioritize quality growth companies with durable moats..." className={`${inp} min-h-[72px]`} />
                </div>
                {manualError && (
                  <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>{manualError}</div>
                )}
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
                  <button type="submit" disabled={isManualPending}
                    style={{ padding: "8px 18px", borderRadius: "var(--radius-xl)", fontSize: "13px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", cursor: "pointer", opacity: isManualPending ? 0.6 : 1 }}>
                    {isManualPending ? "Creating..." : "Create strategy"}
                  </button>
                  <button type="button" onClick={() => setMethod("ai-builder")}
                    style={{ padding: "8px 14px", borderRadius: "var(--radius-xl)", fontSize: "13px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ── Templates body: popular row + view-all ── */}
        {method === "templates" && (
        <div style={{ marginTop: "4px" }}>
          <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "8px" }}>
            Popular starting points
          </p>
          <div
            className="featured-templates-scroll"
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              scrollSnapType: "x mandatory",
              paddingBottom: "2px",
              alignItems: "stretch",
            }}
          >
            {featuredTemplates.map((t) => {
              const bs = badgeStyle(t.badge);
              const isCreating = creatingTemplate === t.id;
              return (
                <div
                  key={t.id}
                  style={{
                    flexShrink: 0,
                    width: "200px",
                    scrollSnapAlign: "start",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--card-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "10px",
                  }}
                >
                  {/* Top: name + badge + description */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "5px", flexWrap: "nowrap", overflow: "hidden" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                      {t.badge && bs && (
                        <span style={{ fontSize: "10px", padding: "1px 5px", borderRadius: "var(--radius-full)", background: bs.bg, border: `1px solid ${bs.border}`, color: bs.color, fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap" }}>
                          {t.badge}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.45, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>{t.description}</p>
                  </div>

                  {/* Bottom: chips + button */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "nowrap", overflow: "hidden" }}>
                      <Chip label={t.risk_level} />
                      <Chip label={t.style} />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUseTemplate(t)}
                      disabled={!!creatingTemplate}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "var(--radius-xl)",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: isCreating ? "var(--text-muted)" : "rgba(96,165,250,0.9)",
                        background: isCreating ? "var(--card-bg)" : "rgba(37,99,235,0.1)",
                        border: `1px solid ${isCreating ? "var(--card-border)" : "rgba(37,99,235,0.25)"}`,
                        cursor: creatingTemplate ? "default" : "pointer",
                        opacity: creatingTemplate && !isCreating ? 0.4 : 1,
                        transition: "background 0.12s, border-color 0.12s, opacity 0.12s",
                        width: "100%",
                        textAlign: "center",
                      }}
                      onMouseEnter={e => { if (!creatingTemplate) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.16)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(37,99,235,0.38)"; } }}
                      onMouseLeave={e => { if (!creatingTemplate) { (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.1)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(37,99,235,0.25)"; } }}
                    >
                      {isCreating ? "Creating..." : "Use template"}
                    </button>
                  </div>
                </div>
              );
            })}
            {/* View all */}
            <button
              type="button"
              onClick={() => setShowAllTemplates(true)}
              style={{
                flexShrink: 0,
                scrollSnapAlign: "start",
                width: "80px",
                background: "transparent",
                border: "1px dashed var(--line-007)",
                borderRadius: "var(--radius-md)",
                padding: "11px 8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "5px",
                cursor: "pointer",
                color: "var(--text-muted)",
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.07)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-muted)"; }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
              </svg>
              <span style={{ fontSize: "10px", fontWeight: 600, textAlign: "center", lineHeight: 1.3 }}>View<br/>all 8</span>
            </button>
          </div>
        </div>
        )}

        {/* ── Atlas modal ───────────────────────────────────────────────── */}
        {showFinn && (
          <StrategyQuestionnaire
            variant="modal"
            onClose={() => setShowFinn(false)}
            onSaved={(name, id) => {
              setShowFinn(false);
              onStrategyCreated(id, name);
            }}
          />
        )}

        {/* ── Templates expand (all 8) ──────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateRows: showAllTemplates ? "1fr" : "0fr", transition: "grid-template-rows 0.36s cubic-bezier(0.16,1,0.3,1)", marginTop: showAllTemplates ? "10px" : "0" }}>
          <div style={{ overflow: "hidden" }}>
            <div className="bt-card" style={{ padding: "18px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "12px" }}>Choose a template</p>
              {templateError && (
                <div style={{ marginBottom: "10px", fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
                  {templateError}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "7px" }} className="templates-grid">
                {TEMPLATES.map((t) => {
                  const bs = badgeStyle(t.badge);
                  const isCreating = creatingTemplate === t.id;
                  return (
                    <div key={t.id} className="bt-card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{t.name}</span>
                          {t.badge && bs && (
                            <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: bs.bg, border: `1px solid ${bs.border}`, color: bs.color, fontWeight: 600, flexShrink: 0 }}>{t.badge}</span>
                          )}
                        </div>
                        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.4, margin: 0 }}>{t.description}</p>
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <Chip label={t.style} />
                        <Chip label={t.risk_level} />
                        <Chip label={t.holding_period_bias} />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUseTemplate(t)}
                        disabled={!!creatingTemplate}
                        style={{ padding: "6px 12px", borderRadius: "var(--radius-xl)", fontSize: "12px", fontWeight: 600, color: "#fff", background: isCreating ? "rgba(37,99,235,0.5)" : "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", cursor: creatingTemplate ? "default" : "pointer", opacity: creatingTemplate && !isCreating ? 0.5 : 1 }}
                      >
                        {isCreating ? "Creating..." : "Use template"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* ── How strategies work ───────────────────────────────────────── */}
      <section>
        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "6px" }}>
          How strategies work
        </p>
        <div className="bt-card" style={{ overflow: "hidden", padding: "0" }}>
          {FAQ.map((item, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", gap: "12px" }}
              >
                <span style={{ fontSize: "12px", fontWeight: openFaq === i ? 600 : 500, color: openFaq === i ? "var(--text-primary)" : "var(--text-secondary)", textAlign: "left", transition: "color 0.15s, font-weight 0.15s" }}>
                  {item.q}
                </span>
                <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"
                  style={{ color: openFaq === i ? "var(--brand-blue)" : "var(--text-muted)", flexShrink: 0, transform: openFaq === i ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.22s cubic-bezier(0.16,1,0.3,1), color 0.15s" }}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              <div style={{ display: "grid", gridTemplateRows: openFaq === i ? "1fr" : "0fr", transition: "grid-template-rows 0.22s cubic-bezier(0.16,1,0.3,1)" }}>
                <div style={{ overflow: "hidden" }}>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.65, padding: "0 14px 10px" }}>{item.a}</p>
                </div>
              </div>
            </div>
          ))}
          {/* Learn more link */}
          <div style={{ padding: "9px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Have more questions?</span>
            <a
              href="/learn"
              style={{ fontSize: "11px", fontWeight: 600, color: "rgba(96,165,250,0.8)", textDecoration: "none", display: "flex", alignItems: "center", gap: "4px", transition: "color 0.12s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(96,165,250,1)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(96,165,250,0.8)"; }}
            >
              Visit Learn
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
