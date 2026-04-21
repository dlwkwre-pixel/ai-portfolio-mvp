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
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!email || !password) {
      setErrorMessage("Please enter both email and password.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    setSuccessMessage("Signed in successfully.");
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main
      className="min-h-screen bg-[#040d1a] text-white flex flex-col items-center justify-center px-6"
      style={{ fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=DM+Serif+Display:ital@0;1&display=swap');

        .login-glow {
          background: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(56,139,253,0.18) 0%, transparent 70%);
        }
        .input-field {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          transition: all 0.2s ease;
        }
        .input-field:focus {
          outline: none;
          border-color: rgba(56,139,253,0.6);
          background: rgba(56,139,253,0.07);
          box-shadow: 0 0 0 3px rgba(56,139,253,0.12);
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
        .cta-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up { animation: fadeUp 0.6s ease forwards; }
        .fade-up-1 { animation-delay: 0.05s; opacity: 0; }
        .fade-up-2 { animation-delay: 0.15s; opacity: 0; }
        .fade-up-3 { animation-delay: 0.25s; opacity: 0; }
      `}</style>

      {/* Background glow */}
      <div className="login-glow pointer-events-none fixed inset-0" />

      {/* Nav */}
      <div className="fixed top-0 left-0 right-0 z-40 border-b border-white/5 bg-[#040d1a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
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
          </Link>
          <Link href="/signup" className="text-sm text-slate-400 transition hover:text-white">
            Don't have an account? <span className="text-blue-400 font-medium">Sign up</span>
          </Link>
        </div>
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md pt-24">
        <div className="fade-up fade-up-1 mb-8 text-center">
          <h1 className="text-4xl font-light tracking-tight" style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}>
            Welcome back
          </h1>
          <p className="mt-2 text-slate-400">Sign in to your BuyTune account</p>
        </div>

        <div className="fade-up fade-up-2 rounded-2xl border border-white/8 bg-white/3 p-8 backdrop-blur-sm">
          <form className="space-y-5" onSubmit={handleSignIn}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Email</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field w-full rounded-xl px-4 py-3 text-white placeholder-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field w-full rounded-xl px-4 py-3 text-white placeholder-slate-500"
              />
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="cta-btn w-full rounded-xl py-3.5 text-base font-semibold text-white"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div className="text-center">
              <button type="button" className="text-sm text-slate-500 transition hover:text-slate-300">
                Forgot password?
              </button>
            </div>
          </form>
        </div>

        <div className="fade-up fade-up-3 mt-6 text-center text-sm text-slate-500">
          Don't have an account?{" "}
          <Link href="/signup" className="font-medium text-blue-400 transition hover:text-blue-300">
            Create one for free
          </Link>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-xs text-slate-600 transition hover:text-slate-400">
            ← Back to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}
