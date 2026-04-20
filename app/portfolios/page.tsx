import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewPortfolioForm from "./new-portfolio-form";
import PortfolioStatusButton from "./portfolio-status-button";

function formatAccountType(value: string | null) {
  if (!value) return "—";

  const map: Record<string, string> = {
    taxable: "Brokerage",
    brokerage: "Brokerage",
    retirement: "Retirement",
    speculative: "Margin",
    margin: "Margin",
    paper_trade: "Paper Trade",
  };

  return map[value] ?? value.replaceAll("_", " ");
}
export default async function PortfoliosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  const { data: activePortfolios, error: activeError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (activeError) {
    throw new Error(activeError.message);
  }

  const { data: archivedPortfolios, error: archivedError } = await supabase
    .from("portfolios")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", false)
    .order("created_at", { ascending: false });

  if (archivedError) {
    throw new Error(archivedError.message);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-400">
              Portfolios
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              Manage your accounts
            </h1>
            <p className="mt-3 text-slate-400">Signed in as {user.email}</p>
          </div>

          <NewPortfolioForm />
        </div>

        <section className="mt-10">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Active Portfolios</h2>
            <p className="mt-2 text-slate-400">
              These are the portfolios currently in use.
            </p>
          </div>

          {activePortfolios && activePortfolios.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {activePortfolios.map((portfolio) => (
                <div
                  key={portfolio.id}
                  className="rounded-3xl border border-slate-800 bg-slate-900 p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold">{portfolio.name}</h3>
                      <p className="mt-2 text-slate-400 capitalize">
                        {portfolio.account_type}
                      </p>
                    </div>

                    <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                      {formatAccountType(portfolio.account_type)}
                    </span>
                  </div>

                  <div className="mt-6 space-y-2 text-slate-300">
                    <p>
                      Cash: $
                      {Number(portfolio.cash_balance).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p>Benchmark: {portfolio.benchmark_symbol ?? "SPY"}</p>
                    <p>
                      Created:{" "}
                      {new Date(portfolio.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {portfolio.description ? (
                    <p className="mt-4 text-sm text-slate-400">
                      {portfolio.description}
                    </p>
                  ) : null}

                  <div className="mt-8 space-y-4">
                    <Link
                      href={`/portfolios/${portfolio.id}`}
                      className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
                    >
                      Open Portfolio
                    </Link>

                    <div>
                      <PortfolioStatusButton
                        portfolioId={portfolio.id}
                        portfolioName={portfolio.name}
                        mode="archive"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
              <h3 className="text-2xl font-semibold">No active portfolios</h3>
              <p className="mt-3 text-slate-400">
                Create your first portfolio to start tracking holdings, cash, and
                AI recommendations.
              </p>
            </div>
          )}
        </section>

        <section className="mt-14">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold">Archived Portfolios</h2>
            <p className="mt-2 text-slate-400">
              Archived portfolios keep their history and can be restored later.
            </p>
          </div>

          {archivedPortfolios && archivedPortfolios.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2">
              {archivedPortfolios.map((portfolio) => (
                <div
                  key={portfolio.id}
                  className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold">{portfolio.name}</h3>
                      <p className="mt-2 text-slate-400 capitalize">
                        {portfolio.account_type}
                      </p>
                    </div>

                    <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">
                      {portfolio.status}
                    </span>
                  </div>

                  <div className="mt-6 space-y-2 text-slate-300">
                    <p>
                      Cash: $
                      {Number(portfolio.cash_balance).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                    <p>Benchmark: {portfolio.benchmark_symbol ?? "SPY"}</p>
                    <p>
                      Created:{" "}
                      {new Date(portfolio.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {portfolio.description ? (
                    <p className="mt-4 text-sm text-slate-400">
                      {portfolio.description}
                    </p>
                  ) : null}

                  <div className="mt-8 space-y-4">
                    <Link
                      href={`/portfolios/${portfolio.id}`}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
                    >
                      Open Portfolio
                    </Link>

                    <div>
                      <PortfolioStatusButton
                        portfolioId={portfolio.id}
                        portfolioName={portfolio.name}
                        mode="restore"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8">
              <h3 className="text-2xl font-semibold">No archived portfolios</h3>
              <p className="mt-3 text-slate-400">
                Archived portfolios will appear here once you archive one.
              </p>
            </div>
          )}
        </section>

        <div className="mt-10">
          <Link href="/dashboard" className="text-slate-400 hover:text-white">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}