import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/app/components/sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-800 bg-slate-900/80 p-6 lg:block">
          <div className="mb-10">
            <h2 className="text-2xl font-semibold tracking-tight">BuyTune.io</h2>
            <p className="mt-2 text-sm text-slate-400">
              AI-powered portfolio operating system
            </p>
          </div>

          <nav className="space-y-3">
            <Link
              href="/dashboard"
              className="block rounded-xl bg-slate-800 px-4 py-3 text-white"
            >
              Dashboard
            </Link>
            <Link
              href="/portfolios"
              className="block rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Portfolios
            </Link>
            <Link
              href="/strategies"
              className="block rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Strategies
            </Link>
            <Link
              href="/"
              className="block rounded-xl px-4 py-3 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              Home
            </Link>
          </nav>

          <div className="mt-8">
            <SignOutButton />
          </div>
        </aside>

        <section className="flex-1 p-6 lg:p-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-400">
                Dashboard
              </p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight">
                Welcome back
              </h1>
              <p className="mt-3 text-slate-400">
                Signed in as {user.email}
              </p>
            </div>

            <Link
              href="/portfolios"
              className="rounded-2xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-500"
            >
              View Portfolios
            </Link>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Total Portfolio Value</p>
              <p className="mt-3 text-3xl font-semibold">$125,430</p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Active Portfolios</p>
              <p className="mt-3 text-3xl font-semibold">3</p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <p className="text-sm text-slate-400">Latest AI Run</p>
              <p className="mt-3 text-3xl font-semibold">Today</p>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-2xl font-semibold">Recent Activity</h2>
              <div className="mt-5 space-y-4 text-slate-300">
                <div className="rounded-2xl bg-slate-800/70 p-4">
                  Added $2,500 cash to Main Account
                </div>
                <div className="rounded-2xl bg-slate-800/70 p-4">
                  AI generated weekly recommendation for Roth IRA
                </div>
                <div className="rounded-2xl bg-slate-800/70 p-4">
                  Updated Growth Strategy settings
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-2xl font-semibold">Next Build Targets</h2>
              <div className="mt-5 space-y-4 text-slate-300">
                <div className="rounded-2xl bg-slate-800/70 p-4">
                  Add portfolio creation form
                </div>
                <div className="rounded-2xl bg-slate-800/70 p-4">
                  Connect Supabase database tables
                </div>
                <div className="rounded-2xl bg-slate-800/70 p-4">
                  Add AI recommendation workflow
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}