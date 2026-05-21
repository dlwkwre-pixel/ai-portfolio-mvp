import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import PlanningClient from "./planning-client";
import type { FinancialProfile, BalanceSheetItem, CashFlowItem, NetWorthSnapshot, PlanningAssumptions, FutureEvent } from "./planning-actions";
import type { HomeScenario } from "./home/home-actions";
import type { CareerScenario } from "./career/career-actions";
import type { EducationScenario } from "./education/education-actions";
import type { FamilyScenario } from "./family/family-actions";

export default async function PlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [
    { data: profileData },
    { data: balanceItems },
    { data: cashFlowItems },
    { data: netWorthHistory },
    { data: portfolios },
    { data: assumptionsData },
    { data: futureEventsData },
    { data: homeScenariosData },
    { data: careerScenariosData },
    { data: educationScenariosData },
    { data: familyScenariosData },
  ] = await Promise.all([
    supabase.from("financial_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("balance_sheet_items").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("cash_flow_items").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("net_worth_history").select("*").eq("user_id", user.id).order("snapshot_date", { ascending: true }).limit(24),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("status", "active"),
    supabase.from("planning_assumptions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("planning_future_events").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("home_planning_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("career_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("education_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("family_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  // Aggregate portfolio value from all active portfolios
  let portfolioTotalValue = 0;
  if (portfolios && portfolios.length > 0) {
    try {
      const { data: allHoldings } = await supabase
        .from("holdings")
        .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
        .in("portfolio_id", portfolios.map((p) => p.id));

      if (allHoldings && allHoldings.length > 0) {
        const valuation = await getPortfolioValuation({
          holdings: allHoldings.map((h) => ({
            id: h.id,
            ticker: h.ticker,
            company_name: h.company_name,
            asset_type: h.asset_type,
            shares: h.shares,
            average_cost_basis: h.average_cost_basis,
          })),
          cashBalance: portfolios.reduce((sum, p) => sum + Number(p.cash_balance ?? 0), 0),
        });
        portfolioTotalValue = valuation.total_portfolio_value ?? 0;
      } else {
        portfolioTotalValue = portfolios.reduce((sum, p) => sum + Number(p.cash_balance ?? 0), 0);
      }
    } catch {
      portfolioTotalValue = portfolios.reduce((sum, p) => sum + Number(p.cash_balance ?? 0), 0);
    }
  }

  const profile: FinancialProfile | null = profileData
    ? {
        id: profileData.id,
        user_id: profileData.user_id,
        current_age: profileData.current_age ?? null,
        target_retirement_age: profileData.target_retirement_age ?? null,
        risk_tolerance: profileData.risk_tolerance ?? "moderate",
        monthly_income: profileData.monthly_income ? Number(profileData.monthly_income) : null,
        monthly_expenses: profileData.monthly_expenses ? Number(profileData.monthly_expenses) : null,
        updated_at: profileData.updated_at,
      }
    : null;

  const typedBalanceItems: BalanceSheetItem[] = (balanceItems ?? []).map((item) => ({
    id: item.id,
    user_id: item.user_id,
    label: item.label,
    category: item.category,
    value: Number(item.value),
    is_liability: item.is_liability,
    sort_order: item.sort_order,
  }));

  const typedCashFlowItems: CashFlowItem[] = (cashFlowItems ?? []).map((item) => ({
    id: item.id,
    user_id: item.user_id,
    label: item.label,
    type: item.type as "income" | "expense",
    frequency: item.frequency as "monthly" | "annual",
    amount: Number(item.amount),
    sort_order: item.sort_order,
  }));

  const typedNetWorthHistory: NetWorthSnapshot[] = (netWorthHistory ?? []).map((s) => ({
    id: s.id,
    snapshot_date: s.snapshot_date,
    total_assets: Number(s.total_assets),
    total_liabilities: Number(s.total_liabilities),
    net_worth: Number(s.net_worth),
    portfolio_value: s.portfolio_value ? Number(s.portfolio_value) : null,
  }));

  const assumptions: PlanningAssumptions | null = assumptionsData
    ? {
        id: assumptionsData.id,
        user_id: assumptionsData.user_id,
        return_rate: Number(assumptionsData.return_rate),
        inflation_rate: Number(assumptionsData.inflation_rate),
        salary_growth_rate: Number(assumptionsData.salary_growth_rate),
        updated_at: assumptionsData.updated_at,
      }
    : null;

  const typedFutureEvents: FutureEvent[] = (futureEventsData ?? []).map((e) => ({
    id: e.id,
    user_id: e.user_id,
    label: e.label,
    event_year: e.event_year,
    amount_impact: Number(e.amount_impact),
    category: e.category,
    sort_order: e.sort_order,
  }));

  const typedHomeScenarios: HomeScenario[] = (homeScenariosData ?? []) as HomeScenario[];
  const typedCareerScenarios: CareerScenario[] = (careerScenariosData ?? []) as CareerScenario[];
  const typedEducationScenarios: EducationScenario[] = (educationScenariosData ?? []) as EducationScenario[];
  const typedFamilyScenarios: FamilyScenario[] = (familyScenariosData ?? []) as FamilyScenario[];

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    cash_balance: Number(p.cash_balance ?? 0),
    account_type: p.account_type,
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex">
        <Sidebar userEmail={user.email} portfolios={sidebarPortfolios} />
      </div>

      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <PlanningClient
          profile={profile}
          balanceItems={typedBalanceItems}
          cashFlowItems={typedCashFlowItems}
          netWorthHistory={typedNetWorthHistory}
          portfolioTotalValue={portfolioTotalValue}
          assumptions={assumptions}
          futureEvents={typedFutureEvents}
          homeScenarios={typedHomeScenarios}
          careerScenarios={typedCareerScenarios}
          educationScenarios={typedEducationScenarios}
          familyScenarios={typedFamilyScenarios}
        />
      </div>
    </div>
  );
}
