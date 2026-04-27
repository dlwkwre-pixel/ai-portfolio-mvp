"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) { router.push("/setup-username"); router.refresh(); return; }
    setSuccess("Account created! Check your email to confirm, then sign in.");
    setLoading(false);
  }

  return (
    <main style={{ minHeight:"100vh", background:"#07090f", display:"flex", fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        input:-webkit-autofill{-webkit-box-shadow:0 0 0 30px #0d1120 inset!important;-webkit-text-fill-color:#e2e8f0!important}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .fu0{animation:fadeUp 0.5s ease both}
        .fu1{animation:fadeUp 0.5s 0.08s ease both}
        .fu2{animation:fadeUp 0.5s 0.16s ease both}
        .fu3{animation:fadeUp 0.5s 0.24s ease both}
        .fu4{animation:fadeUp 0.5s 0.32s ease both}
        .ifield{width:100%;padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#e2e8f0;font-size:14px;font-family:'DM Sans',sans-serif;outline:none;transition:all 0.15s}
        .ifield:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,0.12)}
        .ifield::placeholder{color:#334155}
        .sbtn{width:100%;padding:13px;background:linear-gradient(135deg,#2563eb,#7c3aed);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;box-shadow:0 4px 20px rgba(37,99,235,0.35);transition:all 0.2s}
        .sbtn:hover:not(:disabled){box-shadow:0 6px 28px rgba(37,99,235,0.5);transform:translateY(-1px)}
        .sbtn:disabled{opacity:0.6;cursor:not-allowed}
        .lg-panel{display:none}
        @media(min-width:1024px){.lg-panel{display:flex!important}.mob-logo{display:none!important}}
      `}</style>

      <div className="lg-panel" style={{ flex:1, flexDirection:"column", justifyContent:"space-between", padding:"48px", background:"linear-gradient(135deg,#0a0d15,#0d1420)", borderRight:"1px solid rgba(255,255,255,0.06)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 70% 50% at 30% 40%,rgba(37,99,235,0.12),transparent 60%),radial-gradient(ellipse 40% 40% at 80% 80%,rgba(124,58,237,0.08),transparent 50%)", pointerEvents:"none" }} />
        <Link href="/" style={{ display:"flex", alignItems:"center", gap:"10px", textDecoration:"none", position:"relative", zIndex:1 }}>
          <div style={{ width:"36px", height:"36px", background:"linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/>
              <circle cx="5" cy="16" r="1.2" fill="white" stroke="none"/>
            </svg>
          </div>
          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:"17px", color:"#fff" }}>Buy<span style={{ color:"#7c3aed" }}>Tune</span>.io</span>
        </Link>

        <div style={{ position:"relative", zIndex:1 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:"32px", fontWeight:800, color:"#fff", letterSpacing:"-0.8px", lineHeight:1.15, marginBottom:"20px" }}>
            Start investing<br/>with an edge.
          </h2>
          {[
            { icon:"✦", text:"AI recommendations powered by Grok with live market data" },
            { icon:"📈", text:"True performance tracking using Modified Dietz method" },
            { icon:"⚖️", text:"Benchmark comparison against SPY, QQQ, and more" },
            { icon:"🎯", text:"Personalized strategies that guide every AI decision" },
          ].map((item) => (
            <div key={item.text} style={{ display:"flex", alignItems:"flex-start", gap:"12px", marginBottom:"16px" }}>
              <div style={{ width:"28px", height:"28px", background:"rgba(37,99,235,0.1)", border:"1px solid rgba(37,99,235,0.2)", borderRadius:"7px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"13px", flexShrink:0 }}>
                {item.icon}
              </div>
              <p style={{ fontSize:"13px", color:"#64748b", lineHeight:1.6, paddingTop:"4px" }}>{item.text}</p>
            </div>
          ))}
        </div>
        <div style={{ position:"relative", zIndex:1, fontSize:"12px", color:"#334155" }}>© 2026 BuyTune. All rights reserved.</div>
      </div>

      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"48px 24px" }}>
        <div style={{ width:"100%", maxWidth:"400px" }}>
          <Link href="/" className="mob-logo" style={{ display:"flex", alignItems:"center", gap:"8px", textDecoration:"none", marginBottom:"40px", justifyContent:"center" }}>
            <div style={{ width:"28px", height:"28px", background:"linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius:"7px", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/></svg>
            </div>
            <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:"15px", color:"#fff" }}>Buy<span style={{ color:"#7c3aed" }}>Tune</span>.io</span>
          </Link>

          <div className="fu0" style={{ marginBottom:"32px" }}>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:"26px", fontWeight:700, color:"#fff", letterSpacing:"-0.5px", marginBottom:"6px" }}>Create your account</h1>
            <p style={{ fontSize:"14px", color:"#64748b" }}>Free to start — no credit card required</p>
          </div>

          {success ? (
            <div style={{ background:"rgba(0,211,149,0.08)", border:"1px solid rgba(0,211,149,0.2)", borderRadius:"12px", padding:"20px", textAlign:"center" }}>
              <div style={{ fontSize:"24px", marginBottom:"10px" }}>✉️</div>
              <p style={{ fontSize:"14px", color:"#00d395", fontWeight:500, marginBottom:"6px" }}>Check your inbox</p>
              <p style={{ fontSize:"13px", color:"#64748b" }}>{success}</p>
              <Link href="/login" style={{ display:"inline-block", marginTop:"16px", fontSize:"13px", color:"#93c5fd", textDecoration:"none", fontWeight:500 }}>
                Go to sign in →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSignUp} style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
              <div className="fu1">
                <label style={{ display:"block", fontSize:"12px", fontWeight:500, color:"#64748b", marginBottom:"6px" }}>Full name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" required className="ifield" />
              </div>
              <div className="fu2">
                <label style={{ display:"block", fontSize:"12px", fontWeight:500, color:"#64748b", marginBottom:"6px" }}>Email address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="ifield" />
              </div>
              <div className="fu3">
                <label style={{ display:"block", fontSize:"12px", fontWeight:500, color:"#64748b", marginBottom:"6px" }}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} className="ifield" />
              </div>
              {error && (
                <div style={{ background:"rgba(255,92,92,0.08)", border:"1px solid rgba(255,92,92,0.2)", borderRadius:"8px", padding:"10px 14px", fontSize:"13px", color:"#ff5c5c" }}>
                  {error}
                </div>
              )}
              <div className="fu4">
                <button type="submit" disabled={loading} className="sbtn">
                  {loading ? "Creating account..." : "Create free account"}
                </button>
              </div>
              <p style={{ fontSize:"11px", color:"#334155", textAlign:"center", lineHeight:1.5 }}>
                By creating an account you agree to our Terms of Service and Privacy Policy.
              </p>
            </form>
          )}

          <p style={{ textAlign:"center", fontSize:"13px", color:"#475569", marginTop:"24px" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color:"#93c5fd", textDecoration:"none", fontWeight:500 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
