"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#07090f", display: "flex", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #0d1120 inset !important; -webkit-text-fill-color: #e2e8f0 !important; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fu0 { animation: fadeUp 0.5s cubic-bezier(0.23,1,0.32,1) both; }
        .fu1 { animation: fadeUp 0.5s 0.08s cubic-bezier(0.23,1,0.32,1) both; }
        .fu2 { animation: fadeUp 0.5s 0.16s cubic-bezier(0.23,1,0.32,1) both; }
        .fu3 { animation: fadeUp 0.5s 0.24s cubic-bezier(0.23,1,0.32,1) both; }
        .ifield { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #e2e8f0; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .ifield:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .ifield::placeholder { color: #334155; }
        .sbtn { width: 100%; padding: 13px; background: linear-gradient(135deg, #2563eb, #7c3aed); border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; box-shadow: 0 4px 20px rgba(37,99,235,0.35); transition: box-shadow 0.2s ease, transform 0.18s cubic-bezier(0.23,1,0.32,1); }
        @media (hover: hover) and (pointer: fine) { .sbtn:hover:not(:disabled) { box-shadow: 0 6px 28px rgba(37,99,235,0.5); transform: translateY(-1px); } }
        .sbtn:active:not(:disabled) { transform: scale(0.97); }
        .sbtn:disabled { opacity: 0.6; cursor: not-allowed; }
        .left-panel { display: none; }
        @media (min-width: 1024px) { .left-panel { display: flex !important; } .mobile-logo { display: none !important; } }

        .lp-preview { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow: hidden; margin-top: 28px; }
        .lp-ret { padding: 14px 16px 0; position: relative; height: 136px; overflow: hidden; }
        .lp-ret-label { font-size: 8px; font-weight: 600; letter-spacing: 0.09em; text-transform: uppercase; color: #334155; margin-bottom: 4px; position: relative; z-index: 1; }
        .lp-ret-val { font-family: 'DM Mono', monospace; font-size: 30px; font-weight: 500; color: #00d395; letter-spacing: -0.5px; position: relative; z-index: 1; line-height: 1; }
        .lp-ret-spy { font-family: 'DM Mono', monospace; font-size: 11px; color: #00d395; margin-top: 4px; position: relative; z-index: 1; }
        .lp-ret-note { font-size: 8px; color: #1e293b; margin-top: 3px; position: relative; z-index: 1; }
        .lp-divider { height: 1px; background: rgba(255,255,255,0.04); }
        .lp-rec { padding: 11px 16px; display: flex; align-items: flex-start; gap: 10px; }
        .lp-rec-badge { padding: 2px 7px; border-radius: 4px; font-family: 'DM Mono', monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.06em; background: rgba(245,158,11,0.15); color: #f59e0b; flex-shrink: 0; margin-top: 1px; }
        .lp-rec-ticker { font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 600; color: #e2e8f0; }
        .lp-rec-desc { font-size: 10px; color: #475569; line-height: 1.45; margin-top: 2px; }
      `}</style>

      {/* Left panel */}
      <div className="left-panel" style={{ flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "48px", background: "linear-gradient(160deg, #0a0d15 0%, #0d1420 100%)", borderRight: "1px solid rgba(255,255,255,0.06)", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 50% at 30% 40%, rgba(37,99,235,0.12), transparent 60%), radial-gradient(ellipse 40% 40% at 80% 80%, rgba(124,58,237,0.08), transparent 50%)" }} />

        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", position: "relative", zIndex: 1 }}>
          <div style={{ width: "36px", height: "36px", minWidth: "36px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(37,99,235,0.4)" }}>
            <svg width="16" height="16" viewBox="2 4 20 16" fill="none" stroke="white" strokeWidth="2.5" style={{overflow:"visible"}}>
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
              <circle cx="5" cy="16" r="1.2" fill="white" stroke="none" />
              <circle cx="11" cy="12" r="1.2" fill="white" stroke="none" />
              <circle cx="16" cy="15" r="1.2" fill="white" stroke="none" />
              <circle cx="20" cy="7" r="1.2" fill="white" stroke="none" />
            </svg>
          </div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "17px", color: "#fff", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
            Buy<span style={{ color: "#7c3aed" }}>Tune</span>.io
          </span>
        </Link>

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "99px", background: "rgba(0,211,149,0.07)", border: "1px solid rgba(0,211,149,0.18)", marginBottom: "20px" }}>
            <div style={{ width: "5px", height: "5px", minWidth: "5px", borderRadius: "50%", background: "#00d395" }} />
            <span style={{ fontSize: "11px", color: "#00d395", fontWeight: 500 }}>AI-powered portfolio analysis</span>
          </div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "26px", fontWeight: 800, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1.25, marginBottom: "14px" }}>
            Your portfolio,<br />
            analyzed and tuned<br />
            <span style={{ color: "#93c5fd" }}>by AI.</span>
          </h2>
          <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.65 }}>
            Specific buy, trim, hold, or sell calls for your actual holdings — backed by live prices, earnings, and market sentiment.
          </p>

          {/* Mini portfolio preview */}
          <div className="lp-preview">
            <div className="lp-ret">
              <div className="lp-ret-label">Investment Return</div>
              <div className="lp-ret-val">+14.2%</div>
              <div className="lp-ret-spy">+3.1% vs SPY</div>
              <div className="lp-ret-note">Modified Dietz · deposits excluded</div>
              <svg style={{position:"absolute",bottom:0,left:0,right:0,width:"100%",height:"46px",zIndex:0}} viewBox="0 0 400 46" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00d395" stopOpacity="0.14"/>
                    <stop offset="100%" stopColor="#00d395" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d="M0,40 C80,30 160,18 220,12 C280,8 340,5 400,3 L400,46 L0,46 Z" fill="url(#lg1)"/>
                <path d="M0,40 C80,30 160,18 220,12 C280,8 340,5 400,3" fill="none" stroke="#00d395" strokeWidth="1.5"/>
              </svg>
            </div>
            <div className="lp-divider" />
            <div className="lp-rec">
              <div className="lp-rec-badge">TRIM</div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                  <span className="lp-rec-ticker">NVDA</span>
                  <span style={{fontSize:"9px",color:"#334155"}}>High confidence</span>
                </div>
                <div className="lp-rec-desc">Tech at 62% vs your 40% cap. Reduce 10–12 shares.</div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: "11px", color: "#2d3748", lineHeight: 1.6, marginTop: "18px" }}>
            <strong style={{color:"#334155",fontWeight:500}}>BuyTune recommends. You decide and act.</strong> No auto-trading, ever.
          </p>
        </div>

        <div style={{ position: "relative", zIndex: 1, fontSize: "12px", color: "#334155" }}>© 2026 BuyTune. All rights reserved.</div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <Link href="/" className="mobile-logo" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none", marginBottom: "40px", justifyContent: "center" }}>
            <div style={{ width: "30px", height: "30px", minWidth: "30px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" /></svg>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "16px", color: "#fff", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>
              Buy<span style={{ color: "#7c3aed" }}>Tune</span>.io
            </span>
          </Link>

          <div className="fu0" style={{ marginBottom: "32px" }}>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "26px", fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: "6px" }}>Welcome back</h1>
            <p style={{ fontSize: "14px", color: "#64748b" }}>Sign in to your portfolio workspace</p>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="fu1">
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="ifield" />
            </div>
            <div className="fu2">
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="ifield" />
            </div>
            {error && (
              <div style={{ background: "rgba(255,92,92,0.08)", border: "1px solid rgba(255,92,92,0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#ff5c5c" }}>{error}</div>
            )}
            <div className="fu3">
              <button type="submit" disabled={loading} className="sbtn">{loading ? "Signing in..." : "Sign in"}</button>
            </div>
          </form>

          <p style={{ textAlign: "center", fontSize: "11px", color: "#2d3748", marginTop: "16px", lineHeight: 1.6 }}>
            Free · No credit card required · No brokerage connection needed
          </p>

          <p style={{ textAlign: "center", fontSize: "13px", color: "#475569", marginTop: "20px" }}>
            Don&apos;t have an account?{" "}
            <Link href="/signup" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 500 }}>Create one free</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
