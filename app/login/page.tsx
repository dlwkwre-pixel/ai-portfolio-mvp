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
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 30px #0d1120 inset!important;-webkit-text-fill-color:#e2e8f0!important}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .fu0{animation:fadeUp 0.5s ease both}
        .fu1{animation:fadeUp 0.5s 0.08s ease both}
        .fu2{animation:fadeUp 0.5s 0.16s ease both}
        .fu3{animation:fadeUp 0.5s 0.24s ease both}
        .ifield{width:100%;padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#e2e8f0;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:all 0.15s}
        .ifield:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.12)}
        .ifield::placeholder{color:#334155}
        .sbtn{width:100%;padding:13px;background:linear-gradient(135deg,#2563eb,#7c3aed);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;box-shadow:0 4px 20px rgba(37,99,235,0.35);transition:all 0.2s}
        .sbtn:hover:not(:disabled){box-shadow:0 6px 28px rgba(37,99,235,0.5);transform:translateY(-1px)}
        .sbtn:disabled{opacity:0.6;cursor:not-allowed}
        .lg-panel{display:none}
        @media(min-width:1024px){.lg-panel{display:flex!important}.mob-logo{display:none!important}}
      `}</style>

      {/* Left — branding */}
      <div className="lg-panel" style={{ flex:1, flexDirection:"column", justifyContent:"space-between", padding:"48px", background:"linear-gradient(135deg,#0a0d15,#0d1420)", borderRight:"1px solid rgba(255,255,255,0.06)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 70% 50% at 30% 40%,rgba(37,99,235,0.12),transparent 60%),radial-gradient(ellipse 40% 40% at 80% 80%,rgba(124,58,237,0.08),transparent 50%)", pointerEvents:"none" }} />

        <Link href="/" style={{ display:"flex", alignItems:"center", gap:"10px", textDecoration:"none", position:"relative", zIndex:1 }}>
          <div style={{ width:"24px", height:"24px", background:"linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/>
              <circle cx="5" cy="16" r="1.2" fill="white" stroke="none"/>
              <circle cx="11" cy="12" r="1.2" fill="white" stroke="none"/>
              <circle cx="16" cy="15" r="1.2" fill="white" stroke="none"/>
              <circle cx="20" cy="7" r="1.2" fill="white" stroke="none"/>
            </svg>
          </div>
          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:"17px", color:"#fff" }}>Buy<span style={{ color:"#7c3aed" }}>Tune</span>.io</span>
        </Link>

        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:"5px 12px", borderRadius:"99px", background:"rgba(124,58,237,0.1)", border:"1px solid rgba(167,139,250,0.2)", marginBottom:"20px" }}>
            <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#a78bfa" }} />
            <span style={{ fontSize:"11px", color:"#a78bfa", fontWeight:500 }}>AI-powered investing</span>
          </div>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"36px", fontWeight:800, color:"#fff", letterSpacing:"-1px", lineHeight:1.1, marginBottom:"14px" }}>
            Your portfolio.<br/>
            <span style={{ background:"linear-gradient(135deg,#93c5fd,#a78bfa)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Advisor-level intelligence.</span>
          </h2>
          <p style={{ fontSize:"15px", color:"#64748b", lineHeight:1.7 }}>
            Institutional-grade AI analysis for self-directed investors. No fees, no minimums.
          </p>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px", marginTop:"28px" }}>
            {[["Powered by","Grok + Gemini"],["Benchmark vs","SPY, QQQ + more"],["AI Insights","Buy · Hold · Sell"],["Your brokerage","Stays yours"]].map(([l,v]) => (
              <div key={l} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"10px", padding:"12px 14px" }}>
                <div style={{ fontSize:"9px", fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:"#334155", marginBottom:"4px" }}>{l}</div>
                <div style={{ fontSize:"13px", fontWeight:500, color:"#94a3b8" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position:"relative", zIndex:1, fontSize:"12px", color:"#334155" }}>© 2026 BuyTune. All rights reserved.</div>
      </div>

      {/* Right — form */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"48px 24px" }}>
        <div style={{ width:"100%", maxWidth:"400px" }}>
          <Link href="/" className="mob-logo" style={{ display:"flex", alignItems:"center", gap:"8px", textDecoration:"none", marginBottom:"40px", justifyContent:"center" }}>
            <div style={{ width:"28px", height:"28px", background:"linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius:"7px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/></svg>
            </div>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:"15px", color:"#fff" }}>Buy<span style={{ color:"#7c3aed" }}>Tune</span>.io</span>
          </Link>

          <div className="fu0" style={{ marginBottom:"32px" }}>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:"26px", fontWeight:700, color:"#fff", letterSpacing:"-0.5px", marginBottom:"6px" }}>Welcome back</h1>
            <p style={{ fontSize:"14px", color:"#64748b" }}>Sign in to your portfolio workspace</p>
          </div>

          <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
            <div className="fu1">
              <label style={{ display:"block", fontSize:"12px", fontWeight:500, color:"#64748b", marginBottom:"6px" }}>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="ifield" />
            </div>
            <div className="fu2">
              <label style={{ display:"block", fontSize:"12px", fontWeight:500, color:"#64748b", marginBottom:"6px" }}>Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required className="ifield" />
            </div>
            {error && (
              <div style={{ background:"rgba(255,92,92,0.08)", border:"1px solid rgba(255,92,92,0.2)", borderRadius:"8px", padding:"10px 14px", fontSize:"13px", color:"#ff5c5c" }}>
                {error}
              </div>
            )}
            <div className="fu3">
              <button type="submit" disabled={loading} className="sbtn">
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>

          <p style={{ textAlign:"center", fontSize:"13px", color:"#475569", marginTop:"24px" }}>
            Don't have an account?{" "}
            <Link href="/signup" style={{ color:"#93c5fd", textDecoration:"none", fontWeight:500 }}>Create one free</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
