"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) { setError(error.message); setLoading(false); return; }
    setSent(true);
    setLoading(false);
  }

  return (
    <main style={{ minHeight: "100vh", background: "#07090f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: "24px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #0d1120 inset !important; -webkit-text-fill-color: #e2e8f0 !important; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fu0 { animation: fadeUp 0.5s cubic-bezier(0.23,1,0.32,1) both; }
        .fu1 { animation: fadeUp 0.5s 0.08s cubic-bezier(0.23,1,0.32,1) both; }
        .ifield { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; color: #e2e8f0; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .ifield:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .ifield::placeholder { color: #334155; }
        .sbtn { width: 100%; padding: 13px; background: linear-gradient(135deg, #2563eb, #7c3aed); border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; box-shadow: 0 4px 20px rgba(37,99,235,0.35); transition: box-shadow 0.2s ease, transform 0.18s cubic-bezier(0.23,1,0.32,1); }
        @media (hover: hover) and (pointer: fine) { .sbtn:hover:not(:disabled) { box-shadow: 0 6px 28px rgba(37,99,235,0.5); transform: translateY(-1px); } }
        .sbtn:active:not(:disabled) { transform: scale(0.97); }
        .sbtn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <div style={{ width: "100%", maxWidth: "400px" }}>

        <div className="fu0" style={{ display: "flex", justifyContent: "center", marginBottom: "40px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
            <div style={{ width: "32px", height: "32px", background: "linear-gradient(135deg, #2563eb, #7c3aed)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" /></svg>
            </div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "17px", color: "#fff", letterSpacing: "-0.3px" }}>
              Buy<span style={{ color: "#7c3aed" }}>Tune</span>.io
            </span>
          </Link>
        </div>

        {sent ? (
          <div className="fu0" style={{ textAlign: "center" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>Check your email</h2>
            <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.65, marginBottom: "8px" }}>
              We sent a reset link to <strong style={{ color: "#94a3b8" }}>{email}</strong>.
            </p>
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6 }}>
              The link expires in 1 hour. Check your spam folder if you don&apos;t see it.
            </p>
            <Link href="/login" style={{ display: "inline-block", marginTop: "28px", fontSize: "13px", color: "#93c5fd", textDecoration: "none", fontWeight: 500 }}>
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="fu0" style={{ marginBottom: "32px" }}>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "26px", fontWeight: 700, color: "#fff", letterSpacing: "-0.5px", marginBottom: "6px" }}>Forgot password?</h1>
              <p style={{ fontSize: "14px", color: "#64748b" }}>Enter your email and we&apos;ll send a reset link.</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="fu1">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#64748b", marginBottom: "6px" }}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required className="ifield" autoFocus />
              </div>
              {error && (
                <div style={{ background: "rgba(255,92,92,0.08)", border: "1px solid rgba(255,92,92,0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#ff5c5c" }}>{error}</div>
              )}
              <button type="submit" disabled={loading} className="sbtn">{loading ? "Sending…" : "Send reset link"}</button>
            </form>

            <p style={{ textAlign: "center", fontSize: "13px", color: "#475569", marginTop: "24px" }}>
              Remember it?{" "}
              <Link href="/login" style={{ color: "#93c5fd", textDecoration: "none", fontWeight: 500 }}>Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
