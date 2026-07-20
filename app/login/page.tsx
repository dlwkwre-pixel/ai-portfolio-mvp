"use client";

import Link from "next/link";
import { FormEvent, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandGlyph } from "@/app/components/brand-mark";

// Sage auth — split panel: dark brand showcase (left, a sanctioned dark-panel
// surface) + light sage form (right). Mobile shows the light form only.
const DARK = "oklch(0.22 0.03 150)";
const INK = "oklch(0.2 0.03 150)";
const INK2 = "oklch(0.4 0.03 150)";
const TEAL = "#0e9488";
const GRAD = "linear-gradient(135deg,#3fae4a,#0ea5a0)";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(searchParams.get("error") === "link_expired" ? "That reset link has expired. Request a new one." : "");

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    // Head start: kick the portfolio-valuation warm-up NOW so the expensive math
    // runs while the dashboard redirect + render round-trip is still in flight.
    fetch("/api/warm", { method: "POST", keepalive: true }).catch(() => {});
    router.push(next);
    router.refresh();
  }

  return (
    <main style={{ minHeight: "100vh", background: "oklch(0.91 0.04 150)", display: "flex", fontFamily: "var(--font-body)" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fu0 { animation: fadeUp 0.5s cubic-bezier(0.23,1,0.32,1) both; }
        .fu1 { animation: fadeUp 0.5s 0.08s cubic-bezier(0.23,1,0.32,1) both; }
        .fu2 { animation: fadeUp 0.5s 0.16s cubic-bezier(0.23,1,0.32,1) both; }
        .fu3 { animation: fadeUp 0.5s 0.24s cubic-bezier(0.23,1,0.32,1) both; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .ifield { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(20,30,20,0.14); border-radius: 10px; color: ${INK}; font-size: 14px; font-family: var(--font-body); outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .ifield:focus { border-color: #0ea5a0; box-shadow: 0 0 0 3px rgba(14,165,160,0.14); }
        .ifield::placeholder { color: oklch(0.6 0.02 150); }
        .sbtn { width: 100%; padding: 13px; background: ${GRAD}; border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 700; font-family: var(--font-body); cursor: pointer; box-shadow: 0 4px 20px rgba(14,165,160,0.28); transition: box-shadow 0.2s ease, transform 0.18s cubic-bezier(0.23,1,0.32,1); }
        @media (hover: hover) and (pointer: fine) { .sbtn:hover:not(:disabled) { box-shadow: 0 6px 28px rgba(14,165,160,0.4); transform: translateY(-1px); } }
        .sbtn:active:not(:disabled) { transform: scale(0.97); }
        .sbtn:disabled { opacity: 0.6; cursor: not-allowed; }
        .left-panel { display: none; }
        @media (min-width: 1024px) { .left-panel { display: flex !important; } .mobile-logo { display: none !important; } }
        .lp-preview { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; overflow: hidden; margin-top: 28px; }
        .lp-ret { padding: 14px 16px 0; position: relative; height: 136px; overflow: hidden; }
        .lp-ret-label { font-size: 10px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: oklch(0.62 0.02 150); margin-bottom: 4px; position: relative; z-index: 1; }
        .lp-ret-val { font-family: var(--font-mono); font-size: 30px; font-weight: 500; color: #4fd07f; letter-spacing: -0.5px; position: relative; z-index: 1; line-height: 1; }
        .lp-ret-spy { font-family: var(--font-mono); font-size: 11px; color: #4fd07f; margin-top: 4px; position: relative; z-index: 1; }
        .lp-ret-note { font-size: 10px; color: oklch(0.5 0.02 150); margin-top: 3px; position: relative; z-index: 1; }
        .lp-divider { height: 1px; background: rgba(255,255,255,0.08); }
        .lp-rec { padding: 11px 16px; display: flex; align-items: flex-start; gap: 10px; }
        .lp-rec-badge { padding: 2px 7px; border-radius: 4px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; letter-spacing: 0.06em; background: rgba(200,121,30,0.22); color: #e0a33e; flex-shrink: 0; margin-top: 1px; }
        .lp-rec-ticker { font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: oklch(0.92 0.015 150); }
        .lp-rec-desc { font-size: 10px; color: oklch(0.6 0.02 150); line-height: 1.45; margin-top: 2px; }
      `}</style>

      {/* Left panel — dark brand showcase */}
      <div className="left-panel" style={{ flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "48px", background: DARK, borderRight: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 50% at 30% 40%, rgba(63,174,74,0.14), transparent 60%), radial-gradient(ellipse 40% 40% at 80% 80%, rgba(14,165,160,0.12), transparent 50%)" }} />

        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", position: "relative", zIndex: 1 }}>
          <div style={{ width: "36px", height: "36px", minWidth: "36px", background: GRAD, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(14,165,160,0.4)" }}>
            <BrandGlyph size={18} strokeWidth={2.4} />
          </div>
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "17px", color: "#fff", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
            BuyTune.io
          </span>
        </Link>

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "99px", background: "rgba(63,174,74,0.1)", border: "1px solid rgba(63,174,74,0.25)", marginBottom: "20px" }}>
            <div style={{ width: "5px", height: "5px", minWidth: "5px", borderRadius: "50%", background: "#4fd07f", animation: "pulse 2s ease infinite" }} />
            <span style={{ fontSize: "11px", color: "#8fe3ab", fontWeight: 500 }}>Portfolio · Planning · Tax · Community</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 800, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1.25, marginBottom: "14px" }}>
            Every tool your<br />
            portfolio needs,<br />
            <span style={{ color: "#6fe0aa" }}>in one place.</span>
          </h2>
          <p style={{ fontSize: "13px", color: "oklch(0.72 0.02 150)", lineHeight: 1.65 }}>
            AI recommendations, financial planning, tax tracking, stock research, and a community of investors — all tied to your actual holdings.
          </p>

          {/* Feature pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginTop: "20px", marginBottom: "20px" }}>
            {[
              "AI Recommendations", "Financial Planning", "Tax Center",
              "Stock Research", "Community", "Portfolio Health",
            ].map((label) => (
              <div key={label} style={{
                padding: "4px 10px", borderRadius: "99px",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                fontSize: "11px", color: "oklch(0.82 0.02 150)", fontWeight: 500, whiteSpace: "nowrap",
              }}>{label}</div>
            ))}
          </div>

          {/* Mini portfolio preview */}
          <div className="lp-preview">
            <div className="lp-ret">
              <div className="lp-ret-label">Investment Return</div>
              <div className="lp-ret-val">+14.2%</div>
              <div className="lp-ret-spy">+3.1% vs SPY</div>
              <div className="lp-ret-note">Modified Dietz · deposits excluded</div>
              <svg style={{ position: "absolute", bottom: 0, left: 0, right: 0, width: "100%", height: "46px", zIndex: 0 }} viewBox="0 0 400 46" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4fd07f" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#4fd07f" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,40 C80,30 160,18 220,12 C280,8 340,5 400,3 L400,46 L0,46 Z" fill="url(#lg1)" />
                <path d="M0,40 C80,30 160,18 220,12 C280,8 340,5 400,3" fill="none" stroke="#4fd07f" strokeWidth="1.5" />
              </svg>
            </div>
            <div className="lp-divider" />
            <div className="lp-rec">
              <div className="lp-rec-badge">TRIM</div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className="lp-rec-ticker">NVDA</span>
                  <span style={{ fontSize: "10px", color: "oklch(0.6 0.02 150)" }}>High confidence</span>
                </div>
                <div className="lp-rec-desc">Tech at 62% vs your 40% cap. Reduce 10–12 shares.</div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: "11px", color: "oklch(0.6 0.02 150)", lineHeight: 1.6, marginTop: "18px" }}>
            <strong style={{ color: "oklch(0.78 0.02 150)", fontWeight: 500 }}>BuyTune recommends. You decide and act.</strong> No auto-trading, ever.
          </p>
        </div>

        <div style={{ position: "relative", zIndex: 1, fontSize: "12px", color: "oklch(0.55 0.02 150)" }}>© 2026 BuyTune. All rights reserved.</div>
      </div>

      {/* Right panel — light sage form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <Link href="/" className="mobile-logo" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none", marginBottom: "40px", justifyContent: "center" }}>
            <div style={{ width: "30px", height: "30px", minWidth: "30px", background: GRAD, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BrandGlyph size={14} strokeWidth={2.6} />
            </div>
            <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "16px", color: INK, letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
              BuyTune.io
            </span>
          </Link>

          <div className="fu0" style={{ marginBottom: "32px" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 700, color: INK, letterSpacing: "-0.5px", marginBottom: "6px" }}>Welcome back</h1>
            <p style={{ fontSize: "14px", color: INK2 }}>Sign in to your portfolio workspace</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="fu1">
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: INK2, marginBottom: "6px" }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="ifield" />
            </div>
            <div className="fu2">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 500, color: INK2 }}>Password</label>
                <Link href="/forgot-password" style={{ fontSize: "11px", color: TEAL, textDecoration: "none" }}>Forgot password?</Link>
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="ifield" />
            </div>
            {error && (
              <div style={{ background: "rgba(220,68,68,0.08)", border: "1px solid rgba(220,68,68,0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#b13333" }}>{error}</div>
            )}
            <div className="fu3">
              <button type="submit" disabled={loading} className="sbtn">{loading ? "Signing in..." : "Sign in"}</button>
            </div>
          </form>

          <p style={{ textAlign: "center", fontSize: "11px", color: "oklch(0.5 0.02 150)", marginTop: "16px", lineHeight: 1.6 }}>
            Free · No credit card required · No brokerage connection needed
          </p>

          <p style={{ textAlign: "center", fontSize: "13px", color: INK2, marginTop: "20px" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: TEAL, textDecoration: "none", fontWeight: 600 }}>Create one free</Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
