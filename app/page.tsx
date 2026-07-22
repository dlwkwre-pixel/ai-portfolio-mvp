"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import MarketRibbon from "@/app/components/market-ribbon";
import { BrandGlyph } from "@/app/components/brand-mark";

// Landing v2 — rebuilt from the Sage handoff reference (Buytune Landing (Sage)
// v2). Scroll-driven: 3D-tilt phone mockup, an auto-looping "live scan" demo
// gated by IntersectionObserver (pauses off-screen), scroll-reveal cards, and
// the compliant "gray-area" copy tone (surfaces a signal worth a closer look —
// never "tells you what to buy"). Motion respects prefers-reduced-motion.
const INK = "oklch(0.2 0.03 150)";
const INK2 = "oklch(0.4 0.03 150)";
const INK3 = "oklch(0.5 0.03 150)";
const CARD = "oklch(0.955 0.02 150)";
const LINE = "rgba(20,30,20,0.08)";
const DARK = "oklch(0.22 0.03 150)";
const GRAD = "linear-gradient(135deg,#3fae4a,#0ea5a0)";
const GREEN = "#2f8f3f";
const TEAL = "#0e9488";

const STEPS = [
  { n: "01", title: "Add your portfolio", desc: "Enter your holdings and cash balance. BuyTune tracks true investment return and monitors every position against benchmarks.", bg: "rgba(63,174,74,0.16)", iconColor: "#3fae4a", icon: "M4 7a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7z M4 11h16 M9 15h3" },
  { n: "02", title: "Set your strategy", desc: "Define your style — growth, value, income. Set position caps and sector limits. Every recommendation is checked against them.", bg: "rgba(14,148,136,0.16)", iconColor: "#0e9488", icon: "M4 6h11 M4 12h7 M4 18h11 M17 4v4 M13 10v4 M17 16v4" },
  { n: "03", title: "Review your recommendations", desc: "Grok searches live prices, earnings, and sentiment — then surfaces buy, trim, hold, or sell signals worth your attention. You review and decide.", bg: "rgba(200,121,30,0.16)", iconColor: "#c8791e", icon: "M5 13l3.5 3.5L19 6" },
];

const FEATURES = [
  { title: "Grok AI Recommendations", desc: "For each holding, a buy, trim, hold, or sell signal with the full reasoning behind it.", bg: "rgba(14,148,136,0.15)", iconColor: "#0e9488", icon: "M12 3l1.9 5.8L20 10.5l-6.1 1.7L12 18l-1.9-5.8L4 10.5l6.1-1.7L12 3z" },
  { title: "True Return Tracking", desc: "Modified Dietz strips deposits so you see actual investment gain, benchmarked against SPY or QQQ.", bg: "rgba(63,174,74,0.15)", iconColor: "#3fae4a", icon: "M4 19V5 M4 19h16 M8 15l3-4 3 2 4-6" },
  { title: "Strategy Rules Engine", desc: "Position caps and sector limits filter every AI analysis before it surfaces.", bg: "rgba(200,121,30,0.14)", iconColor: "#c8791e", icon: "M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z" },
  { title: "Stock Research Panel", desc: "Analyst consensus, price targets, news, and sentiment for any ticker.", bg: "rgba(14,148,136,0.15)", iconColor: "#0e9488", icon: "M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-4.35-4.35" },
  { title: "Portfolio Health Score", desc: "A 1–100 score with a written assessment of concentration and diversification risk.", bg: "rgba(63,174,74,0.15)", iconColor: "#3fae4a", icon: "M12 21s-7-4.35-9.5-9C1 8.5 2.5 5 6 5c2 0 3.5 1.2 4 2.2C10.5 6.2 12 5 14 5c3.5 0 5 3.5 3.5 7-2.5 4.65-5.5 9-5.5 9z" },
  { title: "Financial Planning", desc: "Track your balance sheet, cash flow, and run retirement projections with Atlas commentary.", bg: "rgba(200,121,30,0.14)", iconColor: "#c8791e", icon: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M12 8a4 4 0 100 8 4 4 0 000-8z" },
];

const WITHOUT = ["1–2% AUM fees, every year, win or lose", "Advice that answers to the firm's incentives", "Decisions made without live earnings context", "Manual return tracking, no real benchmark"];
const WITH = ["Free — your brokerage stays where it is", "Guidance tied only to your holdings", "Live prices, earnings, and sentiment in every call", "True return tracking with automatic benchmarking"];

const FAQS = [
  { q: "Is BuyTune a robo-advisor?", a: "No. BuyTune never places trades on your behalf. It surfaces AI-generated recommendations for you to review and execute yourself in your own brokerage." },
  { q: "Do I need to connect my brokerage account?", a: "No — you can manually enter holdings and cash balance. A brokerage connection is optional and only used to keep your positions in sync." },
  { q: "What does it cost?", a: "BuyTune is free. There are no AUM fees, no per-trade fees, and no subscription required to get recommendations." },
  { q: "Is my data safe?", a: "Your holdings data is encrypted at rest and in transit, and is never sold or shared with third parties." },
];

const CHART_HEIGHTS = [30, 45, 38, 52, 48, 60, 55, 68, 62, 72, 66, 78];
const SCAN_LABELS = ["Pulling live price & earnings", "Comparing against your strategy caps", "Weighing sentiment & confidence"];

// Compliant hero copy — the "gray-area" tone: surfaces a signal, never commands.
const HERO_SUB = "BuyTune's AI checks your real holdings against live prices, earnings, and sentiment — then surfaces a buy, trim, or hold signal worth a closer look.";

function useReveal(reduced: boolean) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const obs = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (reduced) return; // reduced-motion: everything shows immediately
    obs.current = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const id = (e.target as HTMLElement).dataset.revealId;
          if (id) setRevealed((r) => ({ ...r, [id]: true }));
          obs.current?.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    return () => obs.current?.disconnect();
  }, [reduced]);
  const ref = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el && obs.current) { el.dataset.revealId = id; obs.current.observe(el); }
  }, []);
  return { revealed: (id: string) => reduced || !!revealed[id], ref };
}

export default function LandingPage() {
  const [reduced, setReduced] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [demoStep, setDemoStep] = useState<"idle" | "scanning" | "done">("idle");
  const [scanIdx, setScanIdx] = useState(-1);
  const [openFaq, setOpenFaq] = useState(0);
  const { revealed, ref } = useReveal(reduced);

  const demoElRef = useRef<HTMLDivElement | null>(null);
  const running = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Auto-loop demo, gated to run only while in view (pauses off-screen). With
  // reduced motion we just show the finished result statically.
  useEffect(() => {
    if (reduced) { setDemoStep("done"); setScanIdx(3); return; }
    const el = demoElRef.current;
    if (!el) return;
    const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    const cycle = () => {
      if (!running.current) return;
      setDemoStep("scanning"); setScanIdx(0);
      [1, 2].forEach((i) => timers.current.push(setTimeout(() => running.current && setScanIdx(i), i * 800)));
      timers.current.push(setTimeout(() => { if (running.current) { setDemoStep("done"); setScanIdx(3); } }, 2400));
      timers.current.push(setTimeout(() => {
        if (!running.current) return;
        setDemoStep("idle"); setScanIdx(-1);
        timers.current.push(setTimeout(cycle, 900));
      }, 6600));
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && !running.current) { running.current = true; cycle(); }
        else if (!e.isIntersecting && running.current) { running.current = false; clearTimers(); setDemoStep("idle"); setScanIdx(-1); }
      });
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); running.current = false; clearTimers(); };
  }, [reduced]);

  function heroMove(e: React.MouseEvent) {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ x: -py * 9, y: px * 18 });
  }

  const eyebrow = (color: string): React.CSSProperties => ({ fontSize: "11.5px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color, marginBottom: "12px" });
  const revealStyle = (id: string, delay = 0): React.CSSProperties => ({
    opacity: revealed(id) ? 1 : 0,
    transform: revealed(id) ? "translateY(0)" : "translateY(22px)",
    transition: `opacity 0.7s cubic-bezier(.16,1,.3,1) ${delay}s, transform 0.7s cubic-bezier(.16,1,.3,1) ${delay}s`,
  });

  return (
    <div style={{ fontFamily: "var(--font-body)", background: "oklch(0.91 0.04 150)", color: INK, overflowX: "hidden" }}>
      <style>{`
        @keyframes bt-floatY { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
        @keyframes bt-pulseDot { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes bt-barGrow { from { transform:scaleY(0); } to { transform:scaleY(1); } }
        @keyframes bt-spin { to { transform:rotate(360deg); } }
        .bt-lp-links { display:flex; align-items:center; gap:28px; }
        .bt-lp-hero { grid-template-columns:1fr 1fr; padding:72px 40px 84px; }
        .bt-lp-grid3 { grid-template-columns:repeat(3,1fr); }
        .bt-lp-grid2 { grid-template-columns:1fr 1fr; }
        .bt-lp-steps { grid-template-columns:1fr auto 1fr auto 1fr; }
        .bt-lp-feat:hover { box-shadow:0 12px 28px rgba(20,40,30,0.1); transform:translateY(-3px); border-color:rgba(14,148,136,0.3); }
        @media (max-width: 860px) {
          .bt-lp-links { display:none !important; }
          .bt-lp-hero { grid-template-columns:1fr !important; padding:52px 20px 60px !important; text-align:center; }
          .bt-lp-hero-copy { align-items:center; }
          .bt-lp-visual { order:-1; margin-bottom:8px; transform:scale(0.86); }
          .bt-lp-h1 { font-size:38px !important; }
          .bt-lp-pad { padding-left:20px !important; padding-right:20px !important; }
          .bt-lp-grid3, .bt-lp-grid2, .bt-lp-steps { grid-template-columns:1fr !important; }
          .bt-lp-arrow { display:none !important; }
        }
        @media (prefers-reduced-motion: reduce) { .bt-lp-floaty { animation:none !important; } }
      `}</style>

      {/* NAV */}
      <nav className="bt-lp-pad" style={{ position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 40px", background: "rgba(230,238,228,0.75)", backdropFilter: "blur(10px)", borderBottom: `1px solid ${LINE}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <div style={{ width: "28px", height: "28px", minWidth: "28px", borderRadius: "8px", background: GRAD, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandGlyph size={14} strokeWidth={3.4} />
          </div>
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>BuyTune.io</span>
        </div>
        <div className="bt-lp-links" style={{ fontSize: "13.5px", fontWeight: 500, color: INK2 }}>
          <a href="#demo" style={{ textDecoration: "none", color: "inherit" }}>Live demo</a>
          <a href="#features" style={{ textDecoration: "none", color: "inherit" }}>Product</a>
          <a href="#cost" style={{ textDecoration: "none", color: "inherit" }}>Pricing</a>
          <a href="#faq" style={{ textDecoration: "none", color: "inherit" }}>FAQ</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link href="/login" style={{ textDecoration: "none", fontSize: "13.5px", fontWeight: 600, color: "oklch(0.35 0.03 150)", padding: "9px 6px" }}>Sign in</Link>
          <Link href="/signup" style={{ padding: "9px 18px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 700, color: "#fff", background: GRAD, textDecoration: "none", whiteSpace: "nowrap" }}>Get started free</Link>
        </div>
      </nav>

      {/* TICKER MARQUEE (real live data, dark strip) */}
      <MarketRibbon tone="dark" />

      {/* HERO */}
      <section className="bt-lp-hero" onMouseMove={heroMove} onMouseLeave={() => setTilt({ x: 0, y: 0 })} style={{ position: "relative", display: "grid", gap: "40px", alignItems: "center", maxWidth: "1320px", margin: "0 auto", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "-120px", right: "-80px", width: "520px", height: "520px", borderRadius: "50%", background: "radial-gradient(circle, rgba(14,165,160,0.22), transparent 70%)", filter: "blur(20px)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(63,174,74,0.16), transparent 70%)", filter: "blur(20px)", pointerEvents: "none" }} />

        <div className="bt-lp-hero-copy" style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "99px", background: "rgba(14,148,136,0.1)", border: "1px solid rgba(14,148,136,0.25)", marginBottom: "22px", alignSelf: "flex-start" }}>
            <div className="bt-lp-floaty" style={{ width: "6px", height: "6px", borderRadius: "50%", background: TEAL, animation: "bt-pulseDot 1.8s ease-in-out infinite" }} />
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: "#0e7a70" }}>Powered by Grok · Live market data</span>
          </div>
          <h1 className="bt-lp-h1" style={{ fontFamily: "var(--font-display)", fontSize: "54px", fontWeight: 800, lineHeight: 1.06, letterSpacing: "-1.5px", margin: "0 0 20px" }}>
            Advice that reads<br />your portfolio —<br />
            <span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>not a script.</span>
          </h1>
          <p style={{ fontSize: "16.5px", lineHeight: 1.6, color: INK2, maxWidth: "460px", margin: "0 0 28px" }}>
            {HERO_SUB} You review. You decide. <strong>No auto-trading, ever.</strong>
          </p>
          <div style={{ display: "flex", gap: "12px", marginBottom: "30px", flexWrap: "wrap" }}>
            <Link href="/signup" style={{ padding: "14px 24px", borderRadius: "10px", fontSize: "14.5px", fontWeight: 700, color: "#fff", background: GRAD, boxShadow: "0 8px 24px rgba(14,165,160,0.3)", textDecoration: "none" }}>Get started free →</Link>
            <a href="#demo" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px", padding: "14px 20px", borderRadius: "10px", fontSize: "14.5px", fontWeight: 700, color: "oklch(0.3 0.03 150)", border: "1px solid rgba(20,30,20,0.14)" }}>Try the live demo ↓</a>
          </div>
          <div style={{ display: "flex", gap: "28px", flexWrap: "wrap" }}>
            <div><div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 500, color: GREEN }}>$0</div><div style={{ fontSize: "11.5px", color: INK3, marginTop: "2px" }}>advisor fees</div></div>
            <div style={{ width: "1px", background: "rgba(20,30,20,0.12)" }} />
            <div><div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 500 }}>3</div><div style={{ fontSize: "11.5px", color: INK3, marginTop: "2px" }}>seconds per scan</div></div>
            <div style={{ width: "1px", background: "rgba(20,30,20,0.12)" }} />
            <div><div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 500 }}>100%</div><div style={{ fontSize: "11.5px", color: INK3, marginTop: "2px" }}>human-approved trades</div></div>
          </div>
        </div>

        {/* phone mockup */}
        <div className="bt-lp-visual" style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", perspective: "1400px" }}>
          <div style={{ position: "relative", transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`, transition: "transform 0.25s ease-out", transformStyle: "preserve-3d" }}>
            <div style={{ width: "302px", height: "656px", background: DARK, borderRadius: "36px", padding: "11px", boxSizing: "border-box", boxShadow: "0 40px 70px -20px rgba(20,40,30,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset" }}>
              <div style={{ width: "100%", height: "100%", background: CARD, borderRadius: "26px", overflow: "hidden", position: "relative", padding: "34px 18px 20px", boxSizing: "border-box" }}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "74px", height: "20px", background: DARK, borderRadius: "0 0 13px 13px" }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em", color: "oklch(0.45 0.03 150)", textTransform: "uppercase" }}>Portfolio</div>
                  <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: GRAD }} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "29px", fontWeight: 500, marginTop: "12px" }}>$86,510.32</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: GREEN, marginTop: "3px" }}>▲ 14.2% · +3.1% vs SPY</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "5px", height: "72px", marginTop: "22px" }}>
                  {CHART_HEIGHTS.map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h}%`, background: "linear-gradient(180deg,#0ea5a0,#3fae4a)", borderRadius: "2px", transformOrigin: "bottom", animation: reduced ? undefined : `bt-barGrow 0.6s ease-out ${i * 0.04}s backwards` }} />
                  ))}
                </div>
                <div style={{ marginTop: "22px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: "12px", padding: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "7px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "5px", background: "rgba(200,121,30,0.15)", color: "#a25d13" }}>TRIM</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600 }}>NVDA</span>
                  </div>
                  <div style={{ fontSize: "11.5px", color: "oklch(0.45 0.03 150)", lineHeight: 1.4 }}>Tech at 62% vs your 40% cap.</div>
                </div>
                <div style={{ marginTop: "14px", fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.06em", color: INK3, textTransform: "uppercase" }}>Also flagged</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                  {[{ t: "AAPL", tag: "HOLD", bg: "rgba(63,174,74,0.14)", c: GREEN }, { t: "QQQ", tag: "BUY", bg: "rgba(14,148,136,0.14)", c: "#0e7a70" }].map((r) => (
                    <div key={r.t} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "#fff", border: `1px solid ${LINE}`, borderRadius: "12px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 600 }}>{r.t}</span>
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "5px", background: r.bg, color: r.c }}>{r.tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bt-lp-floaty" style={{ position: "absolute", top: "18px", left: "-92px", background: "#fff", border: "1px solid rgba(20,30,20,0.1)", borderRadius: "12px", padding: "9px 13px", boxShadow: "0 12px 24px rgba(20,30,20,0.12)", animation: reduced ? undefined : "bt-floatY 4.5s ease-in-out infinite" }}>
              <div style={{ fontSize: "9px", color: INK3, fontWeight: 600 }}>HEALTH SCORE</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 600, color: GREEN }}>84 / 100</div>
            </div>
            <div className="bt-lp-floaty" style={{ position: "absolute", bottom: "70px", right: "-84px", background: "#fff", border: "1px solid rgba(20,30,20,0.1)", borderRadius: "12px", padding: "9px 13px", boxShadow: "0 12px 24px rgba(20,30,20,0.12)", animation: reduced ? undefined : "bt-floatY 5s ease-in-out infinite 0.8s" }}>
              <div style={{ fontSize: "9px", color: INK3, fontWeight: 600 }}>AI CONFIDENCE</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 600, color: TEAL }}>High</div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE DEMO */}
      <section id="demo" className="bt-lp-pad" style={{ padding: "70px 40px", background: DARK, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(14,165,160,0.16), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: "11.5px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6fe0aa", marginBottom: "12px" }}>See it work — no signup</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "36px", fontWeight: 800, color: "#fff", letterSpacing: "-0.8px", margin: "0 0 14px" }}>Run a real AI scan, right now.</h2>
          <p style={{ fontSize: "15px", color: "oklch(0.7 0.02 150)", lineHeight: 1.6, margin: "0 0 40px" }}>This is the exact analysis BuyTune runs on your holdings — live prices, earnings, sentiment, checked against a sample growth strategy.</p>

          <div ref={demoElRef} style={{ background: "oklch(0.26 0.03 150)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "18px", padding: "28px", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "#fff" }}>NVDA</div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>NVIDIA Corp</div>
                  <div style={{ fontSize: "11px", color: "oklch(0.6 0.02 150)" }}>Position in your portfolio: 18 shares</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div className="bt-lp-floaty" style={{ width: "7px", height: "7px", borderRadius: "50%", background: demoStep === "idle" ? "oklch(0.6 0.02 150)" : "#4fd07f", animation: "bt-pulseDot 1.4s ease-in-out infinite" }} />
                <span style={{ fontSize: "11.5px", fontWeight: 600, color: "oklch(0.68 0.02 150)" }}>{demoStep === "idle" ? "Ready — scroll to run" : demoStep === "scanning" ? "Scanning your position…" : "Scan complete"}</span>
              </div>
            </div>

            {demoStep === "idle" && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                <span style={{ fontSize: "13.5px", color: "oklch(0.6 0.02 150)" }}>Scroll here to watch BuyTune analyze this position.</span>
              </div>
            )}

            {demoStep === "scanning" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "8px 0" }}>
                {SCAN_LABELS.map((label, i) => {
                  const complete = scanIdx > i, active = scanIdx === i;
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", opacity: scanIdx >= i ? 1 : 0.35 }}>
                      {complete ? (
                        <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="9" height="9" viewBox="0 0 20 20" fill="#fff"><path fillRule="evenodd" d="M16.7 4.15a.75.75 0 01.14 1.05l-8 10.5a.75.75 0 01-1.13.08l-4.5-4.5a.75.75 0 111.06-1.06l3.9 3.89 7.48-9.82a.75.75 0 011.05-.14z" clipRule="evenodd" /></svg>
                        </div>
                      ) : active ? (
                        <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(14,165,160,0.3)", borderTopColor: "#0ea5a0", flexShrink: 0, animation: "bt-spin 0.9s linear infinite" }} />
                      ) : (
                        <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                      )}
                      <span style={{ fontSize: "13.5px", color: "oklch(0.82 0.02 150)" }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {demoStep === "done" && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", paddingTop: "6px" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 10px", borderRadius: "6px", background: "rgba(200,121,30,0.2)", color: "#e0a33e", flexShrink: 0 }}>TRIM</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>Worth trimming 4–6 shares</span>
                    <span style={{ fontSize: "11px", color: "oklch(0.6 0.02 150)" }}>High confidence</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "oklch(0.72 0.02 150)", lineHeight: 1.6, margin: "0 0 10px" }}>Semiconductors now make up 62% of your equity exposure vs. a 40% sector cap in your growth strategy. Earnings beat last quarter, but valuation looks stretched — a case for revisiting your position size.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ flex: 1, height: "5px", borderRadius: "3px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}><div style={{ width: "87%", height: "100%", background: "linear-gradient(90deg,#3fae4a,#0ea5a0)", borderRadius: "3px" }} /></div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "oklch(0.65 0.02 150)" }}>87%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <p style={{ fontSize: "11.5px", color: "oklch(0.5 0.02 150)", marginTop: "16px" }}>This demo replays automatically while in view, using a fixed sample position. Connect your own portfolio to run this on your real holdings.</p>
        </div>
      </section>

      {/* COST COMPARISON */}
      <section id="cost" className="bt-lp-pad" style={{ padding: "80px 40px", maxWidth: "1080px", margin: "0 auto", position: "relative" }}>
        <div style={{ position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", width: "700px", height: "340px", borderRadius: "50%", background: "radial-gradient(circle, rgba(63,174,74,0.1), transparent 70%)", filter: "blur(20px)", pointerEvents: "none" }} />
        <div style={{ textAlign: "center", marginBottom: "48px", position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "6px 13px", borderRadius: "99px", background: "rgba(63,174,74,0.1)", border: "1px solid rgba(63,174,74,0.25)", marginBottom: "18px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 600, color: GREEN }}>The math</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "34px", fontWeight: 800, letterSpacing: "-0.7px", margin: "0 0 12px" }}>A financial advisor costs ~1% a year.<br />BuyTune costs $0.</h2>
          <p style={{ fontSize: "15px", color: INK2, margin: 0 }}>On a $200,000 portfolio, that&apos;s about $2,000 every year — whether your advisor beats the market or not.</p>
        </div>
        <div className="bt-lp-grid2" style={{ display: "grid", gap: "20px", position: "relative", zIndex: 1 }}>
          <div ref={ref("cost-0")} style={{ ...revealStyle("cost-0"), borderRadius: "16px", padding: "26px", background: "rgba(220,68,68,0.06)", border: "1px solid rgba(220,68,68,0.2)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#b13333", marginBottom: "16px" }}>Traditional Advisor</div>
            {WITHOUT.map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "9px", fontSize: "13.5px", color: "oklch(0.35 0.03 150)", marginBottom: "11px", lineHeight: 1.5 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="#c15050" style={{ flexShrink: 0, marginTop: "3px" }}><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div ref={ref("cost-1")} style={{ ...revealStyle("cost-1", 0.1), borderRadius: "16px", padding: "26px", background: "rgba(63,174,74,0.07)", border: "1px solid rgba(63,174,74,0.28)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#158a3f", marginBottom: "16px" }}>BuyTune</div>
            {WITH.map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: "9px", fontSize: "13.5px", color: "oklch(0.35 0.03 150)", marginBottom: "11px", lineHeight: 1.5 }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="#158a3f" style={{ flexShrink: 0, marginTop: "3px" }}><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bt-lp-pad" style={{ padding: "70px 40px", maxWidth: "1120px", margin: "0 auto", position: "relative" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "32px", fontWeight: 800, letterSpacing: "-0.6px", textAlign: "center", margin: "0 0 44px", position: "relative", zIndex: 1 }}>Three steps. Real reasoning.</h2>
        <div className="bt-lp-steps" style={{ display: "grid", gap: 0, alignItems: "start", position: "relative", zIndex: 1 }}>
          {STEPS.map((step, i) => (
            <div key={step.n} style={{ display: "contents" }}>
              <div ref={ref(`step-${i}`)} style={{ ...revealStyle(`step-${i}`, i * 0.08), background: CARD, border: `1px solid ${LINE}`, borderRadius: "16px", padding: "22px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: INK3, marginBottom: "14px" }}>{step.n}</div>
                <div style={{ width: "36px", height: "36px", borderRadius: "9px", background: step.bg, marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={step.iconColor} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{step.icon.split(" M").map((d, k) => <path key={k} d={k === 0 ? d : "M" + d} />)}</svg>
                </div>
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 8px" }}>{step.title}</h3>
                <p style={{ fontSize: "13.5px", color: INK2, lineHeight: 1.55, margin: 0 }}>{step.desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <div className="bt-lp-arrow" style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "16px", width: "36px" }}>
                  <svg width="20" height="14" viewBox="0 0 20 14" fill="none"><path d="M1 7h16M12 1l6 6-6 6" stroke="oklch(0.65 0.03 150)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bt-lp-pad" style={{ padding: "70px 40px", maxWidth: "1180px", margin: "0 auto", position: "relative" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "32px", fontWeight: 800, letterSpacing: "-0.6px", textAlign: "center", margin: "0 0 44px", position: "relative", zIndex: 1 }}>Everything a serious investor needs.</h2>
        <div className="bt-lp-grid3" style={{ display: "grid", gap: "20px", position: "relative", zIndex: 1 }}>
          {FEATURES.map((f, i) => (
            <div key={f.title} ref={ref(`feat-${i}`)} className="bt-lp-feat" style={{ ...revealStyle(`feat-${i}`, (i % 3) * 0.08), background: CARD, border: `1px solid ${LINE}`, borderRadius: "16px", padding: "22px", transition: `opacity 0.7s cubic-bezier(.16,1,.3,1) ${(i % 3) * 0.08}s, transform 0.7s cubic-bezier(.16,1,.3,1) ${(i % 3) * 0.08}s, box-shadow 0.2s, border-color 0.2s` }}>
              <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: f.bg, marginBottom: "13px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={f.iconColor} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{f.icon.split(" M").map((d, k) => <path key={k} d={k === 0 ? d : "M" + d} />)}</svg>
              </div>
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 6px" }}>{f.title}</h3>
              <p style={{ fontSize: "13px", color: "oklch(0.44 0.03 150)", lineHeight: 1.55, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="bt-lp-pad" style={{ padding: "70px 40px 84px", maxWidth: "760px", margin: "0 auto" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "32px", fontWeight: 800, letterSpacing: "-0.6px", textAlign: "center", margin: "0 0 36px" }}>Questions, answered.</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {FAQS.map((f, i) => {
            const open = openFaq === i;
            return (
              <div key={f.q} style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: "12px", overflow: "hidden" }}>
                <button onClick={() => setOpenFaq(open ? -1 : i)} aria-expanded={open} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "17px 20px", cursor: "pointer", background: "none", border: "none", textAlign: "left", fontFamily: "var(--font-body)" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: INK }}>{f.q}</span>
                  <span style={{ fontSize: "16px", color: INK3, transform: `rotate(${open ? 45 : 0}deg)`, transition: "transform 0.25s" }}>+</span>
                </button>
                {open && <p style={{ margin: 0, padding: "0 20px 18px", fontSize: "13.5px", color: INK2, lineHeight: 1.6 }}>{f.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bt-lp-pad" style={{ padding: "64px 40px", background: DARK, textAlign: "center" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "34px", fontWeight: 800, color: "#fff", letterSpacing: "-0.7px", margin: "0 0 14px" }}>Your portfolio deserves better than guesswork.</h2>
        <p style={{ fontSize: "15px", color: "oklch(0.68 0.02 150)", margin: "0 0 28px" }}>Free forever. No brokerage connection required. No auto-trading, ever.</p>
        <Link href="/signup" style={{ display: "inline-block", padding: "15px 28px", borderRadius: "10px", fontSize: "15px", fontWeight: 700, color: "#fff", background: GRAD, boxShadow: "0 10px 28px rgba(14,165,160,0.35)", textDecoration: "none" }}>Get started free →</Link>
      </section>

      <footer style={{ padding: "28px 40px", textAlign: "center", fontSize: "12px", color: INK3, background: DARK, borderTop: "1px solid rgba(255,255,255,0.06)" }}>© 2026 BuyTune.io — Not registered investment advice.</footer>
    </div>
  );
}
