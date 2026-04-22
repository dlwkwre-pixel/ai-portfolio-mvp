"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
      </svg>
    ),
    title: "AI Portfolio Analysis",
    description: "Get deep analysis of your holdings, risk exposure, and sector concentrations — explained in plain English, not jargon.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: "Smart Recommendations",
    description: "Receive personalized buy, hold, and rebalance suggestions tuned to your risk tolerance and investment strategy.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
    title: "Performance Tracking",
    description: "Track real P&L, cost basis, and realized gains across multiple portfolios with institutional-grade precision.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    title: "Strategy Versioning",
    description: "Build, refine, and iterate on investment strategies over time. Keep a full history of every strategic decision.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
      </svg>
    ),
    title: "Multi-Portfolio View",
    description: "Manage conservative, moderate, and aggressive portfolios side-by-side. See the full picture at a glance.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
      </svg>
    ),
    title: "Risk-Tuned Insights",
    description: "Whether you're conservative or aggressive, every AI insight is calibrated to your personal risk profile.",
  },
];

const steps = [
  { number: "01", title: "Connect your portfolio", body: "Add your holdings manually or import transactions. No brokerage connection required." },
  { number: "02", title: "Set your strategy", body: "Define your risk tolerance, investment goals, and time horizon once." },
  { number: "03", title: "Run an AI analysis", body: "Get a full breakdown of your portfolio's strengths, gaps, and recommended actions." },
  { number: "04", title: "Invest with confidence", body: "Act on clear, personalized recommendations — not generic market noise." },
];

function AnimatedCounter({ target, duration = 1500 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return <span ref={ref}>{count.toLocaleString()}</span>;
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#040d1a] text-white" style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&family=DM+Serif+Display:ital@0;1&display=swap');

        .hero-glow {
          background: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(56,139,253,0.22) 0%, transparent 70%),
                      radial-gradient(ellipse 40% 40% at 80% 60%, rgba(99,102,241,0.12) 0%, transparent 60%);
        }
        .card-glow:hover {
          box-shadow: 0 0 0 1px rgba(56,139,253,0.3), 0 8px 32px rgba(56,139,253,0.08);
        }
        .gradient-text {
          background: linear-gradient(135deg, #ffffff 0%, #93c5fd 50%, #6366f1 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .cta-btn {
          background: linear-gradient(135deg, #2563eb, #4f46e5);
          transition: all 0.2s ease;
          box-shadow: 0 4px 24px rgba(37,99,235,0.35);
        }
        .cta-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(37,99,235,0.5);
        }
        .step-line::after {
          content: '';
          position: absolute;
          left: 19px;
          top: 40px;
          bottom: -32px;
          width: 1px;
          background: linear-gradient(to bottom, rgba(56,139,253,0.4), transparent);
        }
        .noise-overlay {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
          pointer-events: none;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .float { animation: float 6s ease-in-out infinite; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .fade-up-1 { animation-delay: 0.1s; opacity: 0; }
        .fade-up-2 { animation-delay: 0.25s; opacity: 0; }
        .fade-up-3 { animation-delay: 0.4s; opacity: 0; }
        .fade-up-4 { animation-delay: 0.55s; opacity: 0; }
      `}</style>

      {/* Noise overlay */}
      <div className="noise-overlay pointer-events-none fixed inset-0 z-50 opacity-40" />

      {/* Nav */}
      <nav className="fixed top-0 z-40 w-full border-b border-white/5 bg-[#040d1a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-blue-400" stroke="currentColor" strokeWidth="2">
                <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
                <circle cx="5" cy="16" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="11" cy="12" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="16" cy="15" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="20" cy="7" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">BuyTune.io</span>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-slate-400 transition hover:text-white">Features</a>
            <a href="#how-it-works" className="text-sm text-slate-400 transition hover:text-white">How it works</a>
            <a href="#pricing" className="text-sm text-slate-400 transition hover:text-white">Pricing</a>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link href="/login" className="rounded-xl px-4 py-2 text-sm text-slate-300 transition hover:text-white">
              Sign in
            </Link>
            <Link href="/signup" className="cta-btn rounded-xl px-5 py-2 text-sm font-semibold text-white">
              Get started free
            </Link>
          </div>

          <button className="md:hidden text-slate-400" onClick={() => setMenuOpen(!menuOpen)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-white/5 bg-[#040d1a] px-6 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <a href="#features" className="text-sm text-slate-400">Features</a>
              <a href="#how-it-works" className="text-sm text-slate-400">How it works</a>
              <a href="#pricing" className="text-sm text-slate-400">Pricing</a>
              <Link href="/login" className="text-sm text-slate-300">Sign in</Link>
              <Link href="/signup" className="cta-btn rounded-xl px-5 py-2.5 text-center text-sm font-semibold text-white">
                Get started free
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="hero-glow relative flex min-h-screen flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        <div className="fade-up fade-up-1 mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-sm text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
          AI-powered investing — now in beta
        </div>

        <h1 className="fade-up fade-up-2 max-w-4xl text-5xl font-light leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
          Your portfolio,{" "}
          <span className="gradient-text italic">analyzed</span>
          <br />
          and tuned by AI
        </h1>

        <p className="fade-up fade-up-3 mt-8 max-w-xl text-lg leading-relaxed text-slate-400">
          BuyTune gives every investor — beginner to seasoned — institutional-grade AI insights, personalized to their strategy and risk profile.
        </p>

        <div className="fade-up fade-up-4 mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Link href="/signup" className="cta-btn rounded-2xl px-8 py-4 text-base font-semibold text-white">
            Start for free
          </Link>
          <Link href="/login" className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-base font-medium text-slate-300 transition hover:bg-white/10">
            Sign in to your account
          </Link>
        </div>

        <p className="mt-5 text-xs text-slate-600">No credit card required · Free plan available</p>

        {/* Hero dashboard mockup */}
        <div className="float relative mx-auto mt-20 w-full max-w-3xl">
          <div className="rounded-2xl border border-white/8 bg-[#0a1628] shadow-2xl shadow-blue-950/50 overflow-hidden">
            {/* Fake browser bar */}
            <div className="flex items-center gap-2 border-b border-white/5 bg-[#07111f] px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
              <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
              <div className="mx-auto rounded-md border border-white/5 bg-white/5 px-12 py-1 text-[11px] text-slate-500">
                app.buytune.io/dashboard
              </div>
            </div>
            {/* Dashboard content */}
            <div className="p-5">
              {/* Top stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Total Value", value: "$124,830", change: "+12.4%", pos: true },
                  { label: "AI Score", value: "84/100", change: "Strong", pos: true },
                  { label: "Risk Level", value: "Moderate", change: "On target", pos: true },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-white/5 bg-white/3 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">{s.label}</p>
                    <p className="mt-1 text-base font-semibold text-white">{s.value}</p>
                    <p className={`text-xs mt-0.5 ${s.pos ? "text-emerald-400" : "text-red-400"}`}>{s.change}</p>
                  </div>
                ))}
              </div>
              {/* AI insight card */}
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 mb-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/20">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 text-blue-400">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-blue-300">AI Recommendation</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      Your tech sector allocation is 62% — significantly above your 40% target. Consider trimming NVDA or MSFT to rebalance toward your moderate risk profile.
                    </p>
                  </div>
                </div>
              </div>
              {/* Holdings */}
              <div className="space-y-2">
                {[
                  { ticker: "AAPL", name: "Apple Inc.", value: "$24,100", pct: "+8.2%" },
                  { ticker: "NVDA", name: "NVIDIA Corp.", value: "$31,400", pct: "+41.3%" },
                  { ticker: "BND", name: "Vanguard Bond ETF", value: "$18,200", pct: "+1.1%" },
                ].map((h) => (
                  <div key={h.ticker} className="flex items-center justify-between rounded-lg border border-white/4 bg-white/2 px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/8 text-[11px] font-bold text-slate-300">{h.ticker.slice(0, 1)}</div>
                      <div>
                        <p className="text-xs font-semibold text-white">{h.ticker}</p>
                        <p className="text-[10px] text-slate-500">{h.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-white">{h.value}</p>
                      <p className="text-[10px] text-emerald-400">{h.pct}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Glow under mockup */}
          <div className="absolute -bottom-8 left-1/2 h-32 w-2/3 -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl" />
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-white/5 bg-white/2 py-12">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {[
            { value: 0, suffix: "", label: "No ads, ever" },
            { value: 100, suffix: "%", label: "Free to use" },
            { value: 2, suffix: " AI", label: "Models analyzing your portfolio" },
            { value: 5, suffix: "min", label: "Avg. setup time" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-semibold text-white">
                <AnimatedCounter target={s.value} />{s.suffix}
              </p>
              <p className="mt-1 text-sm text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-blue-400">Features</p>
            <h2 className="text-4xl font-light tracking-tight sm:text-5xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
              Everything you need to invest smarter
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="card-glow group rounded-2xl border border-white/6 bg-white/2 p-6 transition-all duration-300 hover:bg-white/4"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400">
                  {f.icon}
                </div>
                <h3 className="mb-2 text-base font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-16 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-widest text-blue-400">How it works</p>
            <h2 className="text-4xl font-light tracking-tight sm:text-5xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
              From setup to insight in minutes
            </h2>
          </div>

          <div className="relative space-y-8">
            {steps.map((step, i) => (
              <div key={step.number} className={`relative flex gap-6 ${i < steps.length - 1 ? "step-line" : ""}`}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-sm font-semibold text-blue-400">
                  {step.number}
                </div>
                <div className="pb-2 pt-1.5">
                  <h3 className="text-base font-semibold text-white">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-light tracking-tight sm:text-5xl" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
            Ready to invest with{" "}
            <span className="gradient-text italic">clarity</span>?
          </h2>
          <p className="mt-6 text-lg text-slate-400">
            Join investors already using BuyTune to make smarter, more disciplined decisions.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link href="/signup" className="cta-btn rounded-2xl px-10 py-4 text-base font-semibold text-white">
              Get started for free
            </Link>
            <Link href="/login" className="rounded-2xl border border-white/10 bg-white/5 px-10 py-4 text-base font-medium text-slate-300 transition hover:bg-white/10">
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-blue-400" stroke="currentColor" strokeWidth="2">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
            </svg>
            BuyTune.io — AI-powered portfolio intelligence
          </div>
          <p className="text-xs text-slate-600">© 2025 BuyTune. Not financial advice.</p>
        </div>
      </footer>
    </main>
  );
}
