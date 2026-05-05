"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStrategy } from "./actions";
import StrategyQuestionnaire from "./strategy-questionnaire";

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

// ── FAQ ───────────────────────────────────────────────────────────────────────

const FAQ = [
  {
    q: "What is a strategy in BuyTune?",
    a: "A strategy is a set of rules that guides how the AI analyzes and manages your portfolio. It defines your risk tolerance, trading frequency, holding periods, and investing philosophy.",
  },
  {
    q: "How does the AI use my strategy?",
    a: "When you run AI analysis on a portfolio, the AI reads your strategy's instructions and parameters to tailor its recommendations. A conservative strategy produces very different advice than an aggressive one.",
  },
  {
    q: "Can I have multiple strategies?",
    a: "Yes. Create different strategies for different goals: one for a growth-focused brokerage account, another for a conservative retirement account. Each portfolio can reference a different strategy.",
  },
  {
    q: "What's the difference between templates and the AI builder?",
    a: "Templates are pre-built starting points you can customize immediately. The AI builder interviews you about your personal goals and constructs a strategy from scratch based on your answers.",
  },
  {
    q: "What do the parameters mean?",
    a: "Max single holding caps how much of your portfolio can be in one position. Trading frequency controls how often the AI suggests rebalancing. Time horizon reflects how long you plan to hold positions before reviewing.",
  },
];

// ── Manual form fields ────────────────────────────────────────────────────────

const STRATEGY_STYLES = ["Growth","Value","Blend","Dividend / Income","Quality","Index / Passive","Sector / Thematic","Momentum","Swing","Mean Reversion","Defensive","Balanced","Speculative","Custom"];
const RISK_LEVELS = ["Conservative", "Moderate", "Aggressive"];
const TURNOVER_PREFS = ["Low", "Moderate", "High"];
const HOLDING_BIASES = ["Short-term","Swing","Medium-term","Long-term","Very Long-term","Flexible"];

const inp = "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-slate-600 outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const sel = "w-full rounded-xl border border-white/10 bg-[#07090f] px-3 py-2.5 text-sm text-white outline-none transition focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/20";
const lbl = "mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500";

// ── Badge color ───────────────────────────────────────────────────────────────

function badgeStyle(badge: string | null) {
  if (!badge) return null;
  if (badge === "Higher risk") return { color: "var(--red)", bg: "var(--red-bg)", border: "var(--red-border)" };
  if (badge === "Popular") return { color: "var(--brand-blue)", bg: "rgba(37,99,235,0.1)", border: "rgba(37,99,235,0.2)" };
  return { color: "var(--text-muted)", bg: "var(--card-bg)", border: "var(--card-border)" };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Section = "ai-builder" | "templates" | "manual" | null;

export default function StrategiesHub() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<Section>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [creatingTemplate, setCreatingTemplate] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [manualError, setManualError] = useState("");
  const [isManualPending, startManual] = useTransition();

  function toggleSection(s: Section) {
    setActiveSection(prev => prev === s ? null : s);
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
      await createStrategy(fd);
      router.refresh();
      setActiveSection(null);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Failed to create strategy.");
    } finally {
      setCreatingTemplate(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── Creation zone ─────────────────────────────────────────────── */}
      <section>
        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "10px" }}>
          Create a strategy
        </p>

        {/* 3-path grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.2fr 0.8fr",
            gap: "10px",
          }}
          className="strategies-hub-grid"
        >
          {/* AI Builder */}
          <button
            type="button"
            onClick={() => toggleSection("ai-builder")}
            className="bt-card"
            style={{
              padding: "18px 20px",
              textAlign: "left",
              cursor: "pointer",
              border: activeSection === "ai-builder" ? "1px solid rgba(37,99,235,0.4)" : undefined,
              background: activeSection === "ai-builder" ? "rgba(37,99,235,0.06)" : undefined,
              transition: "border-color 0.2s, background 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: "rgba(96,165,250,0.9)" }}>
                  <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>AI Builder</span>
                  <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.25)", color: "rgba(96,165,250,0.9)", fontWeight: 600 }}>Recommended</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                  Answer a few questions and I&apos;ll build a personalized strategy for you.
                </p>
              </div>
            </div>
          </button>

          {/* Templates */}
          <button
            type="button"
            onClick={() => toggleSection("templates")}
            className="bt-card"
            style={{
              padding: "18px 20px",
              textAlign: "left",
              cursor: "pointer",
              border: activeSection === "templates" ? "1px solid rgba(124,58,237,0.4)" : undefined,
              background: activeSection === "templates" ? "rgba(124,58,237,0.05)" : undefined,
              transition: "border-color 0.2s, background 0.2s",
            }}
          >
            <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: "rgba(167,139,250,0.9)" }}>
                <path d="M3.505 2.365A41.369 41.369 0 019 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 00-.577-.069 43.141 43.141 0 00-4.706 0C9.229 4.696 7.5 6.727 7.5 8.998v2.24c0 1.413.67 2.735 1.76 3.562l-2.98 2.98A.75.75 0 015 17.25v-3.443c-.501-.048-1-.106-1.495-.172C2.033 13.438 1 12.162 1 10.72V5.28c0-1.441 1.033-2.717 2.505-2.914z" />
                <path d="M14 6c-.762 0-1.52.02-2.271.062C10.157 6.148 9 7.472 9 8.998v2.24c0 1.519 1.147 2.839 2.71 2.935.214.013.428.024.642.034.2.009.385.09.518.224l2.35 2.35a.75.75 0 001.28-.531v-2.07c.091-.012.182-.024.273-.037C18.567 13.977 20 12.447 20 10.556V8.997c0-1.519-1.157-2.843-2.71-2.936A42.053 42.053 0 0014 6z" />
              </svg>
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginBottom: "4px" }}>Templates</div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              8 ready-to-use starting points.
            </p>
          </button>

          {/* Manual */}
          <button
            type="button"
            onClick={() => toggleSection("manual")}
            className="bt-card"
            style={{
              padding: "18px 20px",
              textAlign: "left",
              cursor: "pointer",
              border: activeSection === "manual" ? "1px solid rgba(255,255,255,0.15)" : undefined,
              transition: "border-color 0.2s",
            }}
          >
            <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: "var(--card-bg)", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "10px" }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-tertiary)" }}>
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)", marginBottom: "4px" }}>Manual</div>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
              Set every parameter yourself.
            </p>
          </button>
        </div>

        {/* Expandable sections */}
        <div
          style={{
            display: "grid",
            gridTemplateRows: activeSection === "ai-builder" ? "1fr" : "0fr",
            transition: "grid-template-rows 0.36s cubic-bezier(0.16,1,0.3,1)",
            marginTop: activeSection === "ai-builder" ? "10px" : "0",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            {activeSection === "ai-builder" && (
              <StrategyQuestionnaire
                variant="inline"
                onClose={() => setActiveSection(null)}
              />
            )}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateRows: activeSection === "templates" ? "1fr" : "0fr",
            transition: "grid-template-rows 0.36s cubic-bezier(0.16,1,0.3,1)",
            marginTop: activeSection === "templates" ? "10px" : "0",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div className="bt-card" style={{ padding: "20px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "14px" }}>
                Choose a template
              </p>
              {templateError && (
                <div style={{ marginBottom: "12px", fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
                  {templateError}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "8px" }} className="templates-grid">
                {TEMPLATES.map((t) => {
                  const bs = badgeStyle(t.badge);
                  const isCreating = creatingTemplate === t.id;
                  return (
                    <div
                      key={t.id}
                      className="bt-card"
                      style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px" }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{t.name}</span>
                          {t.badge && bs && (
                            <span style={{ fontSize: "9px", padding: "1px 6px", borderRadius: "var(--radius-full)", background: bs.bg, border: `1px solid ${bs.border}`, color: bs.color, fontWeight: 600 }}>
                              {t.badge}
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>{t.description}</p>
                      </div>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "9px", padding: "2px 7px", borderRadius: "var(--radius-full)", background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-muted)" }}>{t.style}</span>
                        <span style={{ fontSize: "9px", padding: "2px 7px", borderRadius: "var(--radius-full)", background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-muted)" }}>{t.risk_level}</span>
                        <span style={{ fontSize: "9px", padding: "2px 7px", borderRadius: "var(--radius-full)", background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-muted)" }}>{t.holding_period_bias}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUseTemplate(t)}
                        disabled={!!creatingTemplate}
                        style={{
                          marginTop: "auto",
                          padding: "6px 12px",
                          borderRadius: "var(--radius-xl)",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#fff",
                          background: isCreating ? "rgba(37,99,235,0.5)" : "linear-gradient(135deg,#2563eb,#4f46e5)",
                          border: "none",
                          cursor: creatingTemplate ? "default" : "pointer",
                          opacity: creatingTemplate && !isCreating ? 0.5 : 1,
                        }}
                      >
                        {isCreating ? "Creating..." : "Use this template"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateRows: activeSection === "manual" ? "1fr" : "0fr",
            transition: "grid-template-rows 0.36s cubic-bezier(0.16,1,0.3,1)",
            marginTop: activeSection === "manual" ? "10px" : "0",
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div className="bt-card" style={{ padding: "20px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", marginBottom: "16px" }}>
                Create manually
              </p>
              <form
                style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "12px" }}
                className="manual-form-grid"
                action={(fd) => {
                  setManualError("");
                  startManual(async () => {
                    try {
                      await createStrategy(fd);
                      router.refresh();
                      setActiveSection(null);
                    } catch (err) {
                      setManualError(err instanceof Error ? err.message : "Something went wrong.");
                    }
                  });
                }}
              >
                <div>
                  <label className={lbl}>Strategy name *</label>
                  <input name="name" type="text" placeholder="My Strategy" className={inp} required />
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
                  <input name="max_position_pct" type="number" step="1" min="0" max="100" placeholder="15" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Keep in cash (min) %</label>
                  <input name="cash_min_pct" type="number" step="1" min="0" placeholder="5" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Keep in cash (max) %</label>
                  <input name="cash_max_pct" type="number" step="1" min="0" placeholder="20" className={inp} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={lbl}>Description</label>
                  <textarea name="description" placeholder="A brief description of this strategy's focus." className={`${inp} min-h-[60px]`} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label className={lbl}>AI instructions</label>
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px", lineHeight: 1.5 }}>
                    Sent to the AI when analyzing portfolios using this strategy. Be specific about priorities, sectors to avoid, or risk rules.
                  </p>
                  <textarea name="prompt_text" placeholder="Prioritize quality growth companies with durable moats and strong free cash flow..." className={`${inp} min-h-[80px]`} />
                </div>

                {manualError && (
                  <div style={{ gridColumn: "1 / -1", fontSize: "12px", color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-md)", padding: "8px 12px" }}>
                    {manualError}
                  </div>
                )}

                <div style={{ gridColumn: "1 / -1", display: "flex", gap: "8px" }}>
                  <button
                    type="submit"
                    disabled={isManualPending}
                    style={{ padding: "8px 18px", borderRadius: "var(--radius-xl)", fontSize: "13px", fontWeight: 600, color: "#fff", background: "linear-gradient(135deg,#2563eb,#4f46e5)", border: "none", cursor: "pointer", opacity: isManualPending ? 0.6 : 1 }}
                  >
                    {isManualPending ? "Creating..." : "Create strategy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection(null)}
                    style={{ padding: "8px 14px", borderRadius: "var(--radius-xl)", fontSize: "13px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section>
        <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "8px" }}>
          How strategies work
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {FAQ.map((item, i) => (
            <div key={i} className="bt-card" style={{ overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  gap: "12px",
                }}
              >
                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", textAlign: "left" }}>{item.q}</span>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  style={{
                    color: "var(--text-muted)",
                    flexShrink: 0,
                    transform: openFaq === i ? "rotate(180deg)" : "rotate(0)",
                    transition: "transform 0.24s cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                </svg>
              </button>
              <div
                style={{
                  display: "grid",
                  gridTemplateRows: openFaq === i ? "1fr" : "0fr",
                  transition: "grid-template-rows 0.28s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                <div style={{ overflow: "hidden" }}>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, padding: "0 16px 14px" }}>
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <style>{`
        @media (max-width: 640px) {
          .strategies-hub-grid { grid-template-columns: 1fr !important; }
          .templates-grid { grid-template-columns: 1fr !important; }
          .manual-form-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
