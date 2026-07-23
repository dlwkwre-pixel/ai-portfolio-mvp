"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandGlyph } from "@/app/components/brand-mark";

// Sage auth — split panel matching /login: dark brand showcase (left) + light
// sage form (right). Mobile shows the light form only.
const DARK = "oklch(0.22 0.03 150)";
const INK = "oklch(0.2 0.03 150)";
const INK2 = "oklch(0.4 0.03 150)";
const TEAL = "#0e9488";
const GRAD = "linear-gradient(135deg,#3fae4a,#0ea5a0)";

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
    <div style={{ minHeight: "100vh", background: "oklch(0.91 0.04 150)", display: "flex", flexDirection: "column", fontFamily: "var(--font-body)" }}>
      {/* Sign in / Create account tab toggle — switches between the two routes */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-subtle)" }}>
        <Link href="/login" style={{ padding: "7px 14px", borderRadius: "7px", fontSize: "12.5px", fontWeight: 600, color: INK2, textDecoration: "none" }}>Sign in</Link>
        <span style={{ padding: "7px 14px", borderRadius: "7px", fontSize: "12.5px", fontWeight: 600, color: TEAL, background: "rgba(14,148,136,0.1)" }}>Create account</span>
      </div>
    <main style={{ flex: 1, background: "oklch(0.91 0.04 150)", display: "flex", fontFamily: "var(--font-body)" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .fu0{animation:fadeUp 0.5s ease both}
        .fu1{animation:fadeUp 0.5s 0.08s ease both}
        .fu2{animation:fadeUp 0.5s 0.16s ease both}
        .fu3{animation:fadeUp 0.5s 0.24s ease both}
        .fu4{animation:fadeUp 0.5s 0.32s ease both}
        .ifield{width:100%;padding:12px 14px;background:rgba(255,255,255,0.6);border:1px solid rgba(20,30,20,0.14);border-radius:10px;color:${INK};font-size:14px;font-family:var(--font-body);outline:none;transition:all 0.15s}
        .ifield:focus{border-color:#0ea5a0;box-shadow:0 0 0 3px rgba(14,165,160,0.14)}
        .ifield::placeholder{color:oklch(0.6 0.02 150)}
        .sbtn{width:100%;padding:13px;background:${GRAD};border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;font-family:var(--font-body);cursor:pointer;box-shadow:0 4px 20px rgba(14,165,160,0.28);transition:all 0.2s}
        .sbtn:hover:not(:disabled){box-shadow:0 6px 28px rgba(14,165,160,0.4);transform:translateY(-1px)}
        .sbtn:disabled{opacity:0.6;cursor:not-allowed}
        .lg-panel{display:none}
        @media(min-width:1024px){.lg-panel{display:flex!important}.mob-logo{display:none!important}}
      `}</style>

      <div className="lg-panel" style={{ flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "48px", background: DARK, borderRight: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 30% 40%,rgba(63,174,74,0.14),transparent 60%),radial-gradient(ellipse 40% 40% at 80% 80%,rgba(14,165,160,0.12),transparent 50%)", pointerEvents: "none" }} />
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", position: "relative", zIndex: 1 }}>
          <div style={{ width: "36px", height: "36px", background: GRAD, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandGlyph size={18} strokeWidth={2.4} />
          </div>
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "17px", color: "#fff" }}>BuyTune.io</span>
        </Link>

        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "32px", fontWeight: 800, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1.15, marginBottom: "20px" }}>
            Start investing<br />with an edge.
          </h2>
          {[
            { icon: "M12 3l1.9 5.8L20 10.5l-6.1 1.7L12 18l-1.9-5.8L4 10.5l6.1-1.7L12 3z", text: "AI recommendations powered by Grok with live market data" },
            { icon: "M4 19V5 M4 19h16 M8 15l3-4 3 2 4-6", text: "True performance tracking using the Modified Dietz method" },
            { icon: "M12 3l7 3v5c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-3z", text: "Benchmark comparison against SPY, QQQ, and more" },
            { icon: "M11 4a7 7 0 100 14 7 7 0 000-14z M21 21l-4.35-4.35", text: "Personalized strategies that guide every AI decision" },
          ].map((item) => (
            <div key={item.text} style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
              <div style={{ width: "28px", height: "28px", minWidth: "28px", background: "rgba(63,174,74,0.12)", border: "1px solid rgba(63,174,74,0.25)", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6fe0aa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {item.icon.split(" M").map((d, k) => <path key={k} d={k === 0 ? d : "M" + d} />)}
                </svg>
              </div>
              <p style={{ fontSize: "13px", color: "oklch(0.72 0.02 150)", lineHeight: 1.6, paddingTop: "4px", margin: 0 }}>{item.text}</p>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", zIndex: 1, fontSize: "12px", color: "oklch(0.55 0.02 150)" }}>© 2026 BuyTune. All rights reserved.</div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <Link href="/" className="mob-logo" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "40px", justifyContent: "center" }}>
            <div style={{ width: "28px", height: "28px", background: GRAD, borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BrandGlyph size={14} strokeWidth={2.6} />
            </div>
            <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "15px", color: INK }}>BuyTune.io</span>
          </Link>

          <div className="fu0" style={{ marginBottom: "32px" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 700, color: INK, letterSpacing: "-0.5px", marginBottom: "6px" }}>Create your account</h1>
            <p style={{ fontSize: "14px", color: INK2 }}>Free to start — no credit card required</p>
          </div>

          {success ? (
            <div style={{ background: "rgba(22,163,74,0.09)", border: "1px solid rgba(22,163,74,0.22)", borderRadius: "12px", padding: "20px", textAlign: "center" }}>
              <div style={{ fontSize: "24px", marginBottom: "10px" }}>✉️</div>
              <p style={{ fontSize: "14px", color: "#158a3f", fontWeight: 600, marginBottom: "6px" }}>Check your inbox</p>
              <p style={{ fontSize: "13px", color: INK2 }}>{success}</p>
              <Link href="/login" style={{ display: "inline-block", marginTop: "16px", fontSize: "13px", color: TEAL, textDecoration: "none", fontWeight: 600 }}>
                Go to sign in →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSignUp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="fu1">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: INK2, marginBottom: "6px" }}>Full name</label>
                <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" required className="ifield" />
              </div>
              <div className="fu2">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: INK2, marginBottom: "6px" }}>Email address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="ifield" />
              </div>
              <div className="fu3">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: INK2, marginBottom: "6px" }}>Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" required minLength={8} className="ifield" />
              </div>
              {error && (
                <div style={{ background: "rgba(220,68,68,0.08)", border: "1px solid rgba(220,68,68,0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#b13333" }}>
                  {error}
                </div>
              )}
              <div className="fu4">
                <button type="submit" disabled={loading} className="sbtn">
                  {loading ? "Creating account..." : "Create free account"}
                </button>
              </div>
              <p style={{ fontSize: "11px", color: "oklch(0.5 0.02 150)", textAlign: "center", lineHeight: 1.5 }}>
                By creating an account you agree to our{" "}
                <a href="/legal/terms" style={{ color: TEAL, textDecoration: "none" }}>Terms of Service</a>
                {" "}and{" "}
                <a href="/legal/privacy" style={{ color: TEAL, textDecoration: "none" }}>Privacy Policy</a>.
              </p>
            </form>
          )}

          <p style={{ textAlign: "center", fontSize: "13px", color: INK2, marginTop: "24px" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: TEAL, textDecoration: "none", fontWeight: 600 }}>Sign in</Link>
          </p>
        </div>
      </div>
    </main>
    </div>
  );
}
