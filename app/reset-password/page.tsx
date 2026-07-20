"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandGlyph } from "@/app/components/brand-mark";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const passwordOk = password.length >= 8;
  const confirmOk = password === confirm;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!passwordOk) { setError("Password must be at least 8 characters."); return; }
    if (!confirmOk) { setError("Passwords don't match."); return; }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setLoading(false); return; }
    setDone(true);
    setLoading(false);
    setTimeout(() => router.push("/dashboard"), 2500);
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", padding: "24px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #0d1120 inset !important; -webkit-text-fill-color: oklch(0.2 0.03 150) !important; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .fu0 { animation: fadeUp 0.5s cubic-bezier(0.23,1,0.32,1) both; }
        .fu1 { animation: fadeUp 0.5s 0.08s cubic-bezier(0.23,1,0.32,1) both; }
        .fu2 { animation: fadeUp 0.5s 0.16s cubic-bezier(0.23,1,0.32,1) both; }
        .ifield { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(20,30,20,0.14); border-radius: 10px; color: oklch(0.2 0.03 150); font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .ifield:focus { border-color: #0ea5a0; box-shadow: 0 0 0 3px rgba(14,165,160,0.12); }
        .ifield::placeholder { color: oklch(0.6 0.02 150); }
        .sbtn { width: 100%; padding: 13px; background: var(--brand-gradient); border: none; border-radius: 10px; color: #fff; font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; cursor: pointer; box-shadow: 0 4px 20px rgba(14,165,160,0.35); transition: box-shadow 0.2s ease, transform 0.18s cubic-bezier(0.23,1,0.32,1); }
        @media (hover: hover) and (pointer: fine) { .sbtn:hover:not(:disabled) { box-shadow: 0 6px 28px rgba(14,165,160,0.5); transform: translateY(-1px); } }
        .sbtn:active:not(:disabled) { transform: scale(0.97); }
        .sbtn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <div style={{ width: "100%", maxWidth: "400px" }}>

        <div className="fu0" style={{ display: "flex", justifyContent: "center", marginBottom: "40px" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
            <div style={{ width: "32px", height: "32px", background: "var(--brand-gradient)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BrandGlyph size={14} strokeWidth={2.6} />
            </div>
            <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "17px", color: "oklch(0.2 0.03 150)", letterSpacing: "-0.3px" }}>
              Buy<span style={{ color: "#3fae4a" }}>Tune</span>.io
            </span>
          </Link>
        </div>

        {done ? (
          <div className="fu0" style={{ textAlign: "center" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "rgba(0,211,149,0.1)", border: "1px solid rgba(0,211,149,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00d395" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, color: "oklch(0.2 0.03 150)", marginBottom: "10px" }}>Password updated</h2>
            <p style={{ fontSize: "14px", color: "var(--text-tertiary)" }}>Redirecting you to your dashboard…</p>
          </div>
        ) : (
          <>
            <div className="fu0" style={{ marginBottom: "32px" }}>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "26px", fontWeight: 700, color: "oklch(0.2 0.03 150)", letterSpacing: "-0.5px", marginBottom: "6px" }}>Set a new password</h1>
              <p style={{ fontSize: "14px", color: "var(--text-tertiary)" }}>Choose something strong you&apos;ll remember.</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="fu1">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-tertiary)", marginBottom: "6px" }}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  className="ifield"
                  autoFocus
                />
                {password.length > 0 && !passwordOk && (
                  <p style={{ fontSize: "11px", color: "#f59e0b", marginTop: "5px" }}>At least 8 characters required</p>
                )}
              </div>
              <div className="fu2">
                <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-tertiary)", marginBottom: "6px" }}>Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="ifield"
                />
                {confirm.length > 0 && !confirmOk && (
                  <p style={{ fontSize: "11px", color: "#b13333", marginTop: "5px" }}>Passwords don&apos;t match</p>
                )}
              </div>
              {error && (
                <div style={{ background: "rgba(220,68,68,0.08)", border: "1px solid rgba(220,68,68,0.2)", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", color: "#b13333" }}>{error}</div>
              )}
              <button type="submit" disabled={loading || !passwordOk || !confirmOk} className="sbtn">
                {loading ? "Updating password…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
