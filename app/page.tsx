"use client";

import Link from "next/link";
import { useState } from "react";
import MarketRibbon from "@/app/components/market-ribbon";
import { BrandGlyph } from "@/app/components/brand-mark";

// Sage landing — rebuilt from the design handoff reference (Buytune Landing
// (Sage).dc.html). Values are the authored Sage literals: this is the marketing
// surface and follows the reference pixel-close by design.
const INK = "oklch(0.2 0.03 150)";
const INK2 = "oklch(0.4 0.03 150)";
const CARD = "oklch(0.955 0.02 150)";
const CARD_LINE = "rgba(20,30,20,0.08)";
const TEAL = "#0e9488";
const GRAD = "linear-gradient(135deg,#3fae4a,#0ea5a0)";

type RecTicker = "NVDA" | "TSLA" | "AMD";

const RECS: Record<RecTicker, { name: string; action: "BUY" | "HOLD" | "SELL"; confidence: number; rationale: string }> = {
  NVDA: { name: "NVIDIA Corporation", action: "BUY", confidence: 87, rationale: "Blackwell Ultra shipments tracking ahead of schedule. Hyperscaler capex guidance raised across AWS, Azure, and Google Cloud — near-term supply constraints clearing faster than consensus." },
  TSLA: { name: "Tesla, Inc.", action: "HOLD", confidence: 61, rationale: "Cybertruck recall and EV demand softness are near-term headwinds, offset by FSD v13 momentum and energy storage growth. Conviction is split — watch the next delivery print." },
  AMD: { name: "Advanced Micro Devices", action: "SELL", confidence: 60, rationale: "MI300X traction is positive but AMD continues to lose AI accelerator share to NVDA. Data center GPU revenue guidance missed — price action relative to the broader semis rally is weak." },
};

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  BUY: { bg: "rgba(22,163,74,0.14)", color: "#158a3f" },
  HOLD: { bg: "rgba(200,121,30,0.16)", color: "#8a5414" },
  SELL: { bg: "rgba(220,68,68,0.14)", color: "#b13333" },
};

const STEPS = [
  { n: "01", title: "Add your portfolio", desc: "Enter your holdings and cash balance. BuyTune tracks true investment return and monitors every position against benchmarks.", bg: "rgba(63,174,74,0.16)" },
  { n: "02", title: "Set your strategy", desc: "Define your style — growth, value, income. Set position caps and sector limits. Every recommendation is checked against them.", bg: "rgba(14,148,136,0.16)" },
  { n: "03", title: "Review your recommendations", desc: "Grok searches live prices, earnings, and sentiment — then returns specific buy, trim, hold, or sell calls. You review and decide.", bg: "rgba(200,121,30,0.16)" },
];

const FEATURES = [
  { title: "Grok AI Recommendations", desc: "For each holding, a specific buy, trim, hold, or sell call with the full reasoning behind it.", bg: "rgba(14,148,136,0.15)" },
  { title: "True Return Tracking", desc: "Modified Dietz strips deposits so you see actual investment gain, benchmarked against SPY or QQQ.", bg: "rgba(63,174,74,0.15)" },
  { title: "Strategy Rules Engine", desc: "Position caps and sector limits filter every AI analysis before it surfaces.", bg: "rgba(200,121,30,0.14)" },
  { title: "Stock Research Panel", desc: "Analyst consensus, price targets, news, and sentiment for any ticker.", bg: "rgba(14,148,136,0.15)" },
  { title: "Portfolio Health Score", desc: "A 1–100 score with a written assessment of concentration and diversification risk.", bg: "rgba(63,174,74,0.15)" },
  { title: "Financial Planning", desc: "Track your balance sheet, cash flow, and run retirement projections with Atlas commentary.", bg: "rgba(200,121,30,0.14)" },
];

const FAQS = [
  { q: "Does BuyTune place trades for me?", a: "No. BuyTune provides informational recommendations only — every decision and every trade is yours." },
  { q: "Is it free?", a: "Yes, the core product is free. Your brokerage account stays exactly where it is." },
  { q: "Which brokerages connect?", a: "BuyTune connects via Plaid and SnapTrade, or you can add holdings manually." },
  { q: "Where do recommendations come from?", a: "Live prices, recent earnings, news, and sentiment, filtered through your own strategy rules." },
];

const eyebrow: React.CSSProperties = { fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: "12px" };

export default function LandingPage() {
  const [activeTicker, setActiveTicker] = useState<RecTicker>("NVDA");
  const rec = RECS[activeTicker];
  const ac = ACTION_COLORS[rec.action];

  return (
    <div style={{ fontFamily: "var(--font-body)", background: "oklch(0.91 0.04 150)", color: INK, lineHeight: 1.6, overflowX: "hidden" }}>
      <style>{`
        @keyframes bt-fade-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .lp-fade { animation: bt-fade-up 0.5s ease both; }
        details.lp-faq summary::-webkit-details-marker { display:none; }
        .lp-grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        .lp-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .lp-nav-links { display:flex; gap:26px; }
        @media (max-width: 820px) {
          .lp-grid-3 { grid-template-columns:1fr; }
          .lp-grid-2 { grid-template-columns:1fr; }
          .lp-nav-links { display:none; }
          .lp-pad { padding-left:20px !important; padding-right:20px !important; }
        }
        @media (prefers-reduced-motion: reduce) { .lp-fade { animation:none; } }
      `}</style>

      {/* nav */}
      <nav className="lp-pad" style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 40px", background: "oklch(0.91 0.04 150 / 0.9)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${CARD_LINE}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <div style={{ width: "28px", height: "28px", minWidth: "28px", borderRadius: "7px", background: GRAD, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandGlyph size={15} strokeWidth={3.4} />
          </div>
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "15px", color: INK, letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>BuyTune.io</span>
        </div>
        <div className="lp-nav-links">
          <a href="#how" style={{ fontSize: "13px", color: INK2, textDecoration: "none" }}>How it works</a>
          <a href="#features" style={{ fontSize: "13px", color: INK2, textDecoration: "none" }}>Features</a>
          <a href="#faq" style={{ fontSize: "13px", color: INK2, textDecoration: "none" }}>FAQ</a>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link href="/login" style={{ fontSize: "13px", color: INK2, textDecoration: "none", padding: "8px 6px" }}>Sign in</Link>
          <Link href="/signup" style={{ padding: "8px 17px", borderRadius: "8px", fontSize: "13px", fontWeight: 700, color: "#fff", background: GRAD, textDecoration: "none", whiteSpace: "nowrap" }}>Get started free</Link>
        </div>
      </nav>

      {/* hero */}
      <div className="lp-fade" style={{ textAlign: "center", padding: "64px 24px 8px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "5px 14px", borderRadius: "99px", background: "oklch(0.22 0.03 150)", fontSize: "11px", color: "oklch(0.86 0.1 145)", marginBottom: "20px", fontFamily: "var(--font-mono)", letterSpacing: "0.03em", fontWeight: 600 }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4fd07f" }} /> AI PORTFOLIO COPILOT
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(34px,5.5vw,58px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.08, margin: "0 0 18px", color: INK, textWrap: "balance" }}>
          Your portfolio, analyzed<br />and tuned by AI
        </h1>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 18px", borderRadius: "10px", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.28)", marginBottom: "18px", flexWrap: "wrap", justifyContent: "center" }}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="#158a3f" aria-hidden><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
          <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#158a3f" }}>No auto-trading, ever</span>
          <span style={{ fontSize: "13px", color: "oklch(0.35 0.03 150)" }}>— BuyTune recommends. You decide and act.</span>
        </div>
        <p style={{ fontSize: "clamp(15px,1.6vw,17px)", color: INK2, maxWidth: "520px", margin: "0 auto 26px", lineHeight: 1.65 }}>
          AI recommendations, financial planning, tax tracking, and stock research — every call tied to your actual holdings.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" style={{ padding: "13px 28px", borderRadius: "10px", fontSize: "14.5px", fontWeight: 700, color: "#fff", background: GRAD, boxShadow: "0 8px 24px rgba(15,174,107,0.28)", textDecoration: "none" }}>Start for free</Link>
          <Link href="/login" style={{ padding: "13px 28px", borderRadius: "10px", fontSize: "14.5px", fontWeight: 600, color: "oklch(0.35 0.03 150)", background: "var(--surface-010)", border: "1px solid rgba(20,30,20,0.14)", textDecoration: "none" }}>Sign in to your account</Link>
        </div>
      </div>

      {/* live ticker — real market data, kept from the current site */}
      <div style={{ overflow: "hidden", borderTop: `1px solid ${CARD_LINE}`, borderBottom: `1px solid ${CARD_LINE}`, padding: "6px 0", marginTop: "40px", background: "var(--surface-010)" }}>
        <MarketRibbon />
      </div>

      {/* app preview */}
      <div style={{ padding: "48px 24px 64px", maxWidth: "840px", margin: "0 auto" }}>
        <div style={{ borderRadius: "14px", border: "1px solid rgba(20,30,20,0.1)", background: CARD, overflow: "hidden", boxShadow: "0 30px 70px rgba(20,40,30,0.12)" }}>
          <div style={{ padding: "9px 14px", borderBottom: `1px solid ${CARD_LINE}`, display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ff5f57" }} />
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#febc2e" }} />
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#28c840" }} />
            <div style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "oklch(0.55 0.02 150)" }}>app.buytune.io/dashboard</div>
          </div>
          <div style={{ display: "flex", height: "260px" }}>
            <div className="hidden sm:block" style={{ width: "150px", minWidth: "150px", background: "oklch(0.22 0.03 150)", padding: "12px 9px" }}>
              <div style={{ background: "var(--surface-006)", borderRadius: "8px", padding: "9px 10px", marginBottom: "10px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.6 0.02 150)" }}>Portfolio Value</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 500, color: "oklch(0.95 0.015 90)", marginTop: "2px" }}>$124,830</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#4fd07f" }}>+14.2%</div>
              </div>
              <div style={{ padding: "6px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, color: "#c9f2c9", background: "rgba(63,174,74,0.22)", marginBottom: "2px" }}>Dashboard</div>
              <div style={{ padding: "6px 8px", fontSize: "11px", color: "oklch(0.55 0.02 150)" }}>Portfolios</div>
              <div style={{ padding: "6px 8px", fontSize: "11px", color: "oklch(0.55 0.02 150)" }}>Research</div>
              <div style={{ padding: "6px 8px", fontSize: "11px", color: "oklch(0.55 0.02 150)" }}>Planning</div>
            </div>
            <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: "9px" }}>
              <div style={{ background: "var(--surface-010)", border: "1px solid rgba(20,30,20,0.06)", borderRadius: "10px", padding: "11px 13px" }}>
                <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "oklch(0.5 0.02 150)", marginBottom: "3px" }}>Investment Return</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "19px", fontWeight: 500, color: INK }}>+14.2%</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#16a34a", marginTop: "2px" }}>+3.1% vs SPY</div>
              </div>
              <div style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "oklch(0.5 0.02 150)" }}>AI Recommendations</div>
              <div style={{ background: "rgba(200,121,30,0.09)", border: "1px solid rgba(200,121,30,0.22)", borderRadius: "8px", padding: "9px 11px", display: "flex", gap: "8px" }}>
                <div style={{ flexShrink: 0, padding: "2px 6px", borderRadius: "4px", fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, background: "rgba(200,121,30,0.18)", color: "#8a5414", alignSelf: "flex-start" }}>TRIM</div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 600, color: INK }}>NVDA</div>
                  <div style={{ fontSize: "10px", color: "oklch(0.42 0.02 150)", lineHeight: 1.4, marginTop: "2px" }}>Tech at 62% vs your 40% cap. Reduce 10–12 shares.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* cost comparison — the strongest wedge, kept high on the page */}
      <div className="lp-pad" style={{ padding: "20px 40px 56px", maxWidth: "820px", margin: "0 auto" }}>
        <div style={{ ...eyebrow, textAlign: "center" }}>Why BuyTune</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px,3vw,30px)", fontWeight: 700, color: INK, textAlign: "center", margin: "0 0 28px", letterSpacing: "-0.015em" }}>
          Advisors charge 1–2% of everything you own.<br />BuyTune is free.
        </h2>
        <div className="lp-grid-2">
          <div style={{ background: "rgba(220,68,68,0.06)", border: "1px solid rgba(220,68,68,0.2)", borderRadius: "14px", padding: "22px" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#b13333", marginBottom: "12px" }}>Without BuyTune</div>
            <div style={{ fontSize: "13px", color: "oklch(0.35 0.03 150)", lineHeight: 2 }}>
              1–2% AUM fees, every year, win or lose<br />Advice that answers to the firm&apos;s incentives<br />Decisions made without live earnings context<br />Manual return tracking, no real benchmark
            </div>
          </div>
          <div style={{ background: "rgba(63,174,74,0.06)", border: "1px solid rgba(63,174,74,0.25)", borderRadius: "14px", padding: "22px" }}>
            <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#158a3f", marginBottom: "12px" }}>With BuyTune</div>
            <div style={{ fontSize: "13px", color: "oklch(0.35 0.03 150)", lineHeight: 2 }}>
              Free — your brokerage stays where it is<br />Guidance tied only to your holdings<br />Live prices, earnings, and sentiment in every call<br />True return tracking with automatic benchmarking
            </div>
          </div>
        </div>
      </div>

      {/* how it works */}
      <div id="how" className="lp-pad" style={{ padding: "20px 40px 60px", maxWidth: "1000px", margin: "0 auto" }}>
        <div style={eyebrow}>How it works</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px,3.2vw,34px)", fontWeight: 700, letterSpacing: "-0.015em", color: INK, margin: "0 0 12px", lineHeight: 1.2 }}>Three steps to your first recommendation</h2>
        <p style={{ fontSize: "14.5px", color: INK2, maxWidth: "480px", margin: "0 0 36px" }}>BuyTune sits between you and your brokerage. You stay in full control — the AI does the analysis.</p>
        <div className="lp-grid-3">
          {STEPS.map((step) => (
            <div key={step.n} style={{ background: CARD, border: `1px solid ${CARD_LINE}`, borderRadius: "14px", padding: "22px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "oklch(0.6 0.02 150)", marginBottom: "14px" }}>{step.n}</div>
              <div style={{ width: "34px", height: "34px", borderRadius: "8px", background: step.bg, marginBottom: "12px" }} />
              <div style={{ fontSize: "14.5px", fontWeight: 700, color: INK, margin: "0 0 6px" }}>{step.title}</div>
              <div style={{ fontSize: "12.5px", color: "oklch(0.42 0.03 150)", lineHeight: 1.6 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* interactive AI analysis */}
      <div className="lp-pad" style={{ padding: "20px 40px 60px", maxWidth: "840px", margin: "0 auto" }}>
        <div style={{ ...eyebrow, textAlign: "center" }}>AI Analysis</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px,3vw,30px)", fontWeight: 700, color: INK, textAlign: "center", margin: "0 0 10px", letterSpacing: "-0.015em" }}>Every holding, analyzed</h2>
        <p style={{ fontSize: "14px", color: INK2, textAlign: "center", maxWidth: "460px", margin: "0 auto 28px" }}>Click a ticker to see the reasoning behind its call.</p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginBottom: "20px", flexWrap: "wrap" }}>
          {(Object.keys(RECS) as RecTicker[]).map((t) => {
            const isActive = t === activeTicker;
            return (
              <button
                key={t}
                onClick={() => setActiveTicker(t)}
                aria-pressed={isActive}
                style={{
                  padding: "8px 18px", borderRadius: "8px", fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${isActive ? "rgba(14,148,136,0.4)" : "rgba(20,30,20,0.12)"}`,
                  background: isActive ? "rgba(14,148,136,0.12)" : "rgba(255,255,255,0.4)",
                  color: isActive ? TEAL : INK2,
                  transition: "all 120ms",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div style={{ background: CARD, border: `1px solid ${CARD_LINE}`, borderRadius: "14px", padding: "22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "3px 9px", borderRadius: "99px", background: ac.bg, color: ac.color }}>{rec.action}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: INK }}>{activeTicker}</span>
            <span style={{ fontSize: "12px", color: "oklch(0.45 0.03 150)" }}>{rec.name}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: INK2 }}>{rec.confidence}% confidence</span>
          </div>
          <p style={{ fontSize: "13px", color: INK2, lineHeight: 1.65, margin: 0 }}>{rec.rationale}</p>
        </div>
      </div>

      {/* features */}
      <div id="features" className="lp-pad" style={{ padding: "20px 40px 60px", maxWidth: "1000px", margin: "0 auto" }}>
        <div style={eyebrow}>Features</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px,3.2vw,34px)", fontWeight: 700, color: INK, margin: "0 0 32px", letterSpacing: "-0.015em", lineHeight: 1.2 }}>
          Built for investors who want<br />data behind every decision.
        </h2>
        <div className="lp-grid-3" style={{ gap: "14px" }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: CARD, border: `1px solid ${CARD_LINE}`, borderRadius: "14px", padding: "20px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: f.bg, marginBottom: "11px" }} />
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: INK, margin: "0 0 6px" }}>{f.title}</div>
              <div style={{ fontSize: "12px", color: "oklch(0.42 0.03 150)", lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* faq */}
      <div id="faq" className="lp-pad" style={{ padding: "20px 40px 70px", maxWidth: "720px", margin: "0 auto" }}>
        <div style={{ ...eyebrow, textAlign: "center" }}>FAQ</div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px,3vw,28px)", fontWeight: 700, color: INK, textAlign: "center", margin: "0 0 28px", letterSpacing: "-0.015em" }}>Questions, answered</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {FAQS.map((item) => (
            <details key={item.q} className="lp-faq" style={{ background: CARD, border: "1px solid rgba(20,30,20,0.09)", borderRadius: "12px", overflow: "hidden" }}>
              <summary style={{ listStyle: "none", cursor: "pointer", padding: "15px 18px", fontSize: "14px", fontWeight: 600, color: INK }}>{item.q}</summary>
              <div style={{ padding: "0 18px 15px", fontSize: "13px", color: INK2, lineHeight: 1.6 }}>{item.a}</div>
            </details>
          ))}
        </div>
      </div>

      {/* CTA band */}
      <div style={{ padding: "60px 40px", textAlign: "center", background: "oklch(0.22 0.03 150)" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px,3.5vw,34px)", fontWeight: 800, color: "oklch(0.95 0.015 90)", margin: "0 0 12px", letterSpacing: "-0.015em" }}>
          Your intelligence layer is one signup away.
        </h2>
        <p style={{ fontSize: "14.5px", color: "oklch(0.7 0.02 150)", margin: "0 0 26px" }}>Free. No auto-trading. You decide and act.</p>
        <Link href="/signup" style={{ display: "inline-flex", padding: "13px 28px", borderRadius: "10px", fontSize: "14.5px", fontWeight: 700, color: "#fff", background: GRAD, textDecoration: "none" }}>Start for free</Link>
      </div>

      <footer className="lp-pad" style={{ padding: "22px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", color: INK2, borderTop: `1px solid ${CARD_LINE}`, flexWrap: "wrap", gap: "10px" }}>
        <span>© 2026 BuyTune.io</span>
        <div style={{ display: "flex", gap: "18px" }}>
          <Link href="/privacy" style={{ textDecoration: "none", color: TEAL }}>Privacy</Link>
          <Link href="/terms" style={{ textDecoration: "none", color: TEAL }}>Terms</Link>
          <Link href="/accessibility" style={{ textDecoration: "none", color: TEAL }}>Accessibility</Link>
        </div>
      </footer>
    </div>
  );
}
