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
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSignUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      setSuccessMessage("Account created successfully.");
      setLoading(false);
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setSuccessMessage(
      "Account created. Check your email to confirm your account, then sign in."
    );
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_35%),linear-gradient(180deg,#020617_0%,#071a35_55%,#0b1f3a_100%)] px-8 py-12 lg:px-16">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute left-10 top-16 h-72 w-72 rounded-full bg-sky-500 blur-3xl" />
            <div className="absolute bottom-10 right-10 h-64 w-64 rounded-full bg-blue-700 blur-3xl" />
          </div>

          <div className="relative z-10 flex h-full flex-col justify-center">
            <div className="mb-12 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-7 w-7 text-white"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
                  <circle cx="5" cy="16" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="11" cy="12" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="16" cy="15" r="1.2" fill="currentColor" stroke="none" />
                  <circle cx="20" cy="7" r="1.2" fill="currentColor" stroke="none" />
                </svg>
              </div>

              <span className="text-3xl font-semibold tracking-tight">
                BuyTune.io
              </span>
            </div>

            <div className="max-w-2xl">
              <h1 className="text-5xl font-semibold leading-tight text-white sm:text-6xl">
                Build your investing
                <br />
                operating system.
              </h1>

              <p className="mt-6 max-w-xl text-xl leading-9 text-slate-300">
                Create portfolios, assign strategies, track holdings, and review
                AI recommendations in one place.
              </p>
            </div>
          </div>
        </section>

        <section className="relative flex items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_35%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_55%,#e8f1ff_100%)] px-6 py-12">
          <div className="absolute -top-16 right-10 h-48 w-48 rounded-full bg-sky-200/50 blur-3xl" />
          <div className="absolute bottom-0 left-10 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl" />

          <div className="relative z-10 w-full max-w-md rounded-[28px] border border-slate-200/80 bg-white/90 p-8 shadow-2xl shadow-slate-300/30 backdrop-blur">
            <h2 className="text-center text-4xl font-semibold tracking-tight text-slate-800">
              Create account
            </h2>

            <form className="mt-10 space-y-6" onSubmit={handleSignUp}>
              <div>
                <label className="mb-2 block text-lg font-medium text-slate-600">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="Your name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-lg font-medium text-slate-600">
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-lg font-medium text-slate-600">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-4 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  required
                />
              </div>

              {errorMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {successMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="block w-full rounded-2xl bg-blue-600 px-4 py-4 text-center text-xl font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Creating Account..." : "Create Account"}
              </button>

              <div className="border-t border-slate-200 pt-6 text-center text-lg text-slate-500">
                Already have an account?{" "}
                <Link
                  href="/"
                  className="font-semibold text-blue-600 hover:text-blue-500"
                >
                  Sign in
                </Link>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}