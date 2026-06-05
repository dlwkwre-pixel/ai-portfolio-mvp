import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import HomeClient from "./home-client";
import type { HomeScenario } from "./home-actions";
import type { FinancialProfile, FutureEvent } from "@/app/planning/planning-actions";
import { ageFromDob } from "@/app/planning/planning-utils";

export default async function HomePlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [
    { data: scenariosData },
    { data: profileData },
    { data: portfolios },
    { data: assumptionsData },
    { data: homeEventsData },
    { data: balanceSheetData },
    { data: lifeGoalEventsData },
    { data: cashFlowData },
  ] = await Promise.all([
    supabase
      .from("home_planning_scenarios")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("financial_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("portfolios")
      .select("id, name, cash_balance, account_type")
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase
      .from("planning_assumptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("planning_future_events")
      .select("id, user_id, label, event_year, amount_impact, category, sort_order")
      .eq("user_id", user.id)
      .in("category", ["home_purchase", "home_sale"])
      .order("event_year"),
    supabase
      .from("balance_sheet_items")
      .select("label, category, value")
      .eq("user_id", user.id),
    supabase
      .from("planning_future_events")
      .select("id, user_id, label, event_year, amount_impact, category, sort_order")
      .eq("user_id", user.id)
      .not("category", "in", "(home_purchase,home_sale)")
      .order("event_year"),
    supabase
      .from("cash_flow_items")
      .select("label, type, frequency, amount")
      .eq("user_id", user.id),
  ]);

  const scenarios: HomeScenario[] = (scenariosData ?? []) as HomeScenario[];

  const profile: FinancialProfile | null = profileData
    ? {
        id: profileData.id,
        user_id: profileData.user_id,
        date_of_birth: profileData.date_of_birth ?? null,
        current_age: ageFromDob(profileData.date_of_birth ?? null),
        target_retirement_age: profileData.target_retirement_age ?? null,
        risk_tolerance: profileData.risk_tolerance ?? "moderate",
        gross_monthly_income: profileData.gross_monthly_income ? Number(profileData.gross_monthly_income) : null,
        pre_tax_deductions_annual: profileData.pre_tax_deductions_annual ? Number(profileData.pre_tax_deductions_annual) : null,
        net_monthly_override: profileData.net_monthly_override ? Number(profileData.net_monthly_override) : null,
        monthly_expenses: profileData.monthly_expenses ? Number(profileData.monthly_expenses) : null,
        filing_status: profileData.filing_status ?? "single",
        state_code: profileData.state_code ?? null,
        income_type: profileData.income_type ?? "w2",
        partner_name: profileData.partner_name ?? null,
        partner_age: profileData.partner_age ?? null,
        partner_target_retirement_age: profileData.partner_target_retirement_age ?? null,
        kids_json: Array.isArray(profileData.kids_json) ? profileData.kids_json : [],
        updated_at: profileData.updated_at,
        // Owner-mover mode
        is_homeowner: profileData.is_homeowner ?? false,
        owner_home_value: profileData.owner_home_value ? Number(profileData.owner_home_value) : null,
        owner_mortgage_balance: profileData.owner_mortgage_balance ? Number(profileData.owner_mortgage_balance) : null,
        owner_monthly_payment: profileData.owner_monthly_payment ? Number(profileData.owner_monthly_payment) : null,
        owner_interest_rate: profileData.owner_interest_rate ? Number(profileData.owner_interest_rate) : null,
        owner_remaining_term: profileData.owner_remaining_term ? Number(profileData.owner_remaining_term) : null,
        owner_agent_commission_pct: profileData.owner_agent_commission_pct ? Number(profileData.owner_agent_commission_pct) : 6,
        owner_move_in_costs: profileData.owner_move_in_costs ? Number(profileData.owner_move_in_costs) : 0,
        owner_expected_sale_price: profileData.owner_expected_sale_price ? Number(profileData.owner_expected_sale_price) : null,
        owner_hoa_monthly: profileData.owner_hoa_monthly ? Number(profileData.owner_hoa_monthly) : null,
      }
    : null;

  const investmentReturn = assumptionsData ? Number(assumptionsData.return_rate) : 0.07;
  const salaryGrowthRate = assumptionsData ? Number(assumptionsData.salary_growth_rate) : 0.02;
  const homeEvents: FutureEvent[] = (homeEventsData ?? []) as FutureEvent[];
  const lifeGoalEvents: FutureEvent[] = (lifeGoalEventsData ?? []) as FutureEvent[];
  const balanceSheetItems = (balanceSheetData ?? []) as { label: string; category: string; value: number }[];
  const liquidAssets = balanceSheetItems
    .filter((i) => i.category === "cash")
    .reduce((s, i) => s + Number(i.value ?? 0), 0);
  const cashFlowItems = (cashFlowData ?? []) as { label: string; type: string; frequency: string; amount: number }[];

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
        <HomeClient
          scenarios={scenarios}
          profile={profile}
          defaultInvestmentReturn={investmentReturn}
          homeEvents={homeEvents}
          salaryGrowthRate={salaryGrowthRate}
          liquidAssets={liquidAssets}
          lifeGoalEvents={lifeGoalEvents}
          balanceSheetItems={balanceSheetItems}
          cashFlowItems={cashFlowItems}
        />
      </div>
    </div>
  );
}
