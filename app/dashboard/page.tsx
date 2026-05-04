import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import DashboardClient from "./dashboard-client";

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAccountType(value: string | null) {
  const map: Record<string, string> = {
    taxable: "Brokerage", brokerage: "Brokerage", retirement: "Retirement",
    speculative: "Margin", margin: "Margin", paper_trade: "Paper Trade",
    roth_ira: "Roth IRA", traditional_ira: "Traditional IRA",
  };
  return map[value ?? ""] ?? (value?.replaceAll("_", " ") ?? "—");
}

function accountDotColor(value: string | null) {
  const t = (value || "").toLowerCase();
  if (["brokerage", "taxable"].includes(t)) return "#3b82f6";
  if (["roth_ira", "traditional_ira", "retirement"].includes(t)) return "#00d395";
  if (["margin", "speculative"].includes(t)) return "#f59e0b";
  if (["paper_trade", "paper trade"].includes(t)) return "#a78bfa";
  return "#64748b";
}

function truncateText(value: string | null | undefined, max = 120) {
  if (!value) return "";
  return value.length <= max ? value : value.slice(0, max - 3) + "...";
}

function actionBadgeClass(action: string | null) {
  const a = (action || "").toLowerCase();
  if (a === "buy" || a === "add") return "bt-badge bt-badge-buy";
  if (a === "sell") return "bt-badge bt-badge-sell";
  if (a === "trim") return "bt-badge bt-badge-trim";
  return "bt-badge bt-badge-hold";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ onboarding?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const forceOnboarding = params?.onboarding === "1";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Fetch onboarding status
  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("onboarding_status, onboarding_step")
    .eq("id", user.id)
    .maybeSingle();
  const onboardingStatus = (profileData?.onboarding_status ?? "not_started") as string;
  const onboardingStep = Number(profileData?.onboarding_step ?? 1);

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, name, is_active, cash_balance, benchmark_symbol, created_at, status, account_type, display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const [{ count: strategiesCount }, { data: userStrategies }] = await Promise.all([
    supabase.from("strategies").select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("is_active", true),
    supabase.from("strategies")
      .select("id, name, description, style, risk_level")
      .eq("user_id", user.id).eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  const activePortfolios = (portfolios ?? []).filter((p) => p.is_active);
  const archivedPortfolios = (portfolios ?? []).filter((p) => !p.is_active);
  const portfolioIds = activePortfolios.map((p) => p.id);

  let totalValue = 0;
  let totalDayChange = 0;
  let totalCash = 0;
  const portfolioValues: Record<string, number> = {};
  const portfolioCash: Record<string, number> = {};

  for (const p of activePortfolios) {
    const { data: holdings } = await supabase
      .from("holdings").select("id, ticker, company_name, asset_type, shares, average_cost_basis")
      .eq("portfolio_id", p.id);

    const pCash = Number(p.cash_balance ?? 0);
    const val = await getPortfolioValuation({
      holdings: (holdings ?? []).map((h) => ({
        id: h.id, ticker: h.ticker, company_name: h.company_name,
        asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
      })),
      cashBalance: pCash,
    });

    portfolioValues[p.id] = val.total_portfolio_value;
    portfolioCash[p.id] = pCash;
    totalValue += val.total_portfolio_value;
    totalCash += pCash;
    for (const h of val.valued_holdings) {
      if (h.day_change !== null) {
        totalDayChange += h.day_change * h.shares_number;
      }
    }
  }

  let recentRuns: any[] = [];
  let recentTransactions: any[] = [];
  let latestRecommendations: any[] = [];

  if (portfolioIds.length > 0) {
    const [{ data: runs }, { data: transactions }, { data: recs }] = await Promise.all([
      supabase.from("recommendation_runs").select("id, portfolio_id, status, summary, created_at")
        .in("portfolio_id", portfolioIds).order("created_at", { ascending: false }).limit(5),
      supabase.from("portfolio_transactions").select("id, portfolio_id, transaction_type, ticker, net_cash_impact, traded_at")
        .in("portfolio_id", portfolioIds).order("traded_at", { ascending: false }).limit(8),
      supabase.from("recommendation_items").select("id, portfolio_id, action_type, ticker, thesis, recommendation_status")
        .in("portfolio_id", portfolioIds).eq("recommendation_status", "proposed")
        .order("created_at", { ascending: false }).limit(15),
    ]);
    recentRuns = runs ?? [];
    recentTransactions = transactions ?? [];
    latestRecommendations = recs ?? [];
  }

  const portfolioNameById = new Map(activePortfolios.map((p) => [p.id, p.name]));

  const recsByPortfolio = new Map<string, any[]>();
  for (const rec of latestRecommendations) {
    const existing = recsByPortfolio.get(rec.portfolio_id) ?? [];
    if (existing.length < 3) existing.push(rec);
    recsByPortfolio.set(rec.portfolio_id, existing);
  }

  const portfolioRows = activePortfolios.map((p) => ({
    id: p.id,
    name: p.name,
    account_type: p.account_type,
    accountTypeLabel: formatAccountType(p.account_type),
    dotColor: accountDotColor(p.account_type),
    totalValue: portfolioValues[p.id] ?? 0,
    totalValueLabel: formatMoney(portfolioValues[p.id] ?? 0),
    cashBalance: portfolioCash[p.id] ?? 0,
    cashLabel: formatMoney(portfolioCash[p.id] ?? 0),
    benchmarkSymbol: p.benchmark_symbol || "SPY",
    status: p.status,
    createdAt: p.created_at,
    aiRecs: (recsByPortfolio.get(p.id) ?? []).map((r) => ({
      id: r.id,
      action_type: r.action_type,
      ticker: r.ticker,
      thesis: truncateText(r.thesis, 70),
      badgeClass: actionBadgeClass(r.action_type),
    })),
  }));

  const feedItems = [
    ...recentTransactions.map((t) => ({
      id: `tx-${t.id}`,
      kind: "transaction" as const,
      portfolioName: portfolioNameById.get(t.portfolio_id) ?? "Unknown",
      portfolioId: t.portfolio_id,
      title: `${(t.transaction_type || "").replace("_", " ")} · ${t.ticker || ""}`.trim(),
      occurredAt: t.traded_at,
      amount: Number(t.net_cash_impact ?? 0),
      href: `/portfolios/${t.portfolio_id}?tab=transactions`,
      status: null,
    })),
    ...recentRuns.map((r) => ({
      id: `run-${r.id}`,
      kind: "ai" as const,
      portfolioName: portfolioNameById.get(r.portfolio_id) ?? "Unknown",
      portfolioId: r.portfolio_id,
      title: truncateText(r.summary, 80) || "AI Analysis",
      occurredAt: r.created_at,
      amount: null,
      href: `/portfolios/${r.portfolio_id}?tab=ai`,
      status: r.status,
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 10);

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
    }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            totalValue={totalValue}
            portfolios={activePortfolios.map((p) => ({
              id: p.id, name: p.name,
              cash_balance: Number(p.cash_balance ?? 0),
              account_type: p.account_type,
            }))}
          />
        </div>

        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          <div style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-base)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}>
            <div>
              <h1 style={{
                fontFamily: "var(--font-display)",
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--text-primary)",
                letterSpacing: "-0.2px",
              }}>
                Dashboard
              </h1>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                Welcome back, {user.email?.split("@")[0]}
              </p>
            </div>
            <div className="hidden sm:flex" style={{ gap: "8px" }}>
              <Link href="/portfolios" className="bt-btn bt-btn-ghost bt-btn-sm">
                Manage Portfolios
              </Link>
              <Link href="/strategies" className="bt-btn bt-btn-ghost bt-btn-sm">
                Strategies
              </Link>
            </div>
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <DashboardClient
              portfolioRows={portfolioRows}
              archivedRows={archivedPortfolios.map((p) => ({ id: p.id, name: p.name }))}
              feedItems={feedItems}
              totalValue={totalValue}
              totalValueLabel={formatMoney(totalValue)}
              strategiesCount={strategiesCount ?? 0}
              lastRunAt={recentRuns[0]?.created_at ?? null}
              totalDayChange={totalDayChange}
              totalCash={totalCash}
              showOnboarding={forceOnboarding || onboardingStatus === "not_started" || onboardingStatus === "in_progress"}
              forceOnboarding={forceOnboarding}
              initialOnboardingStep={onboardingStep}
              existingPortfolios={activePortfolios.map((p) => ({ id: p.id, name: p.name, account_type: p.account_type }))}
              existingStrategies={(userStrategies ?? []).map((s) => ({ id: s.id, name: s.name, description: s.description ?? null, risk_level: s.risk_level ?? null }))}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
