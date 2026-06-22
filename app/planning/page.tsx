import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import PlanningClient from "./planning-client";
import type { FinancialProfile, BalanceSheetItem, CashFlowItem, NetWorthSnapshot, PlanningAssumptions, FutureEvent, ExpenseActual, EstateProfile, EstateBeneficiary, EstateAccount, BudgetHistoryEntry } from "./planning-actions";
import { ageFromDob } from "./planning-utils";
import type { HomeScenario } from "./home/home-actions";
import type { CareerScenario } from "./career/career-actions";
import type { EducationScenario } from "./education/education-actions";
import type { FamilyScenario } from "./family/family-actions";
import type { SabbaticalScenario } from "./sabbatical/sabbatical-actions";
import type { CarScenario } from "./car/car-actions";
import type { ApartmentListing } from "./apartment/apartment-actions";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const initialTab = (params.tab as string) ?? "overview";
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
    { data: sabbaticalScenariosData },
    { data: carScenariosData },
    { data: apartmentListingsData },
    { data: expenseActualsData },
    { data: estateProfileData },
    { data: budgetHistoryData },
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
    supabase.from("sabbatical_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("car_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("apartment_listings").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("expense_actuals").select("*").eq("user_id", user.id).order("period_year", { ascending: false }).order("period_month", { ascending: false }).limit(120),
    supabase.from("estate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("cash_flow_budget_history").select("*").eq("user_id", user.id).order("effective_year").order("effective_month"),
  ]);

  // Value each portfolio on its own so the balance sheet can classify it by account type
  // (a Roth IRA portfolio is tax-free money, a brokerage is taxable, etc.).
  let portfolioTotalValue = 0;
  const portfolioAccounts: { id: string; name: string; account_type: string | null; value: number }[] = [];
  if (portfolios && portfolios.length > 0) {
    const { data: allHoldings } = await supabase
      .from("holdings")
      .select("id, portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
      .in("portfolio_id", portfolios.map((p) => p.id));
    const byPortfolio = new Map<string, typeof allHoldings>();
    for (const h of allHoldings ?? []) {
      const arr = byPortfolio.get(h.portfolio_id) ?? [];
      arr.push(h);
      byPortfolio.set(h.portfolio_id, arr);
    }
    for (const p of portfolios) {
      const cash = Number(p.cash_balance ?? 0);
      const hs = byPortfolio.get(p.id) ?? [];
      let value = cash;
      try {
        if (hs.length > 0) {
          const valuation = await getPortfolioValuation({
            holdings: hs.map((h) => ({
              id: h.id, ticker: h.ticker, company_name: h.company_name,
              asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
              manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
            })),
            cashBalance: cash,
          });
          value = valuation.total_portfolio_value ?? cash;
        }
      } catch {
        value = cash;
      }
      portfolioAccounts.push({ id: p.id, name: p.name, account_type: p.account_type ?? null, value });
      portfolioTotalValue += value;
    }
  }

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
    due_day: item.due_day ?? null,
    sort_order: item.sort_order,
    category: item.category ?? null,
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
  const typedSabbaticalScenarios: SabbaticalScenario[] = (sabbaticalScenariosData ?? []) as SabbaticalScenario[];
  const typedCarScenarios: CarScenario[] = (carScenariosData ?? []) as CarScenario[];
  const typedApartmentListings: ApartmentListing[] = (apartmentListingsData ?? []) as ApartmentListing[];

  const typedEstateProfile: EstateProfile | null = estateProfileData
    ? {
        id: estateProfileData.id,
        user_id: estateProfileData.user_id,
        doc_will:                 estateProfileData.doc_will ?? "none",
        doc_living_trust:         estateProfileData.doc_living_trust ?? "none",
        doc_durable_poa:          estateProfileData.doc_durable_poa ?? "none",
        doc_healthcare_directive: estateProfileData.doc_healthcare_directive ?? "none",
        doc_beneficiary_desig:    estateProfileData.doc_beneficiary_desig ?? "none",
        doc_digital_assets:       estateProfileData.doc_digital_assets ?? "none",
        executor_name:            estateProfileData.executor_name ?? null,
        executor_phone:           estateProfileData.executor_phone ?? null,
        executor_email:           estateProfileData.executor_email ?? null,
        attorney_name:            estateProfileData.attorney_name ?? null,
        attorney_phone:           estateProfileData.attorney_phone ?? null,
        attorney_email:           estateProfileData.attorney_email ?? null,
        healthcare_proxy_name:    estateProfileData.healthcare_proxy_name ?? null,
        healthcare_proxy_phone:   estateProfileData.healthcare_proxy_phone ?? null,
        beneficiaries:            (estateProfileData.beneficiaries ?? []) as EstateBeneficiary[],
        estate_accounts:          (estateProfileData.estate_accounts ?? []) as EstateAccount[],
        family_instructions:      estateProfileData.family_instructions ?? null,
        notes:                    estateProfileData.notes ?? null,
        last_reviewed_at:         estateProfileData.last_reviewed_at ?? null,
        updated_at:               estateProfileData.updated_at,
      }
    : null;

  const typedExpenseActuals: ExpenseActual[] = (expenseActualsData ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    cash_flow_item_id: r.cash_flow_item_id ?? null,
    label: r.label,
    period_year: r.period_year,
    period_month: r.period_month,
    actual_amount: Number(r.actual_amount),
    notes: r.notes ?? null,
    breakdown: Array.isArray(r.breakdown) ? r.breakdown : null,
    created_at: r.created_at,
  }));

  const typedBudgetHistory: BudgetHistoryEntry[] = (budgetHistoryData ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    item_id: r.item_id,
    amount: Number(r.amount),
    frequency: r.frequency as "monthly" | "annual",
    effective_year: r.effective_year,
    effective_month: r.effective_month,
    created_at: r.created_at,
  }));

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
          portfolioAccounts={portfolioAccounts}
          assumptions={assumptions}
          futureEvents={typedFutureEvents}
          homeScenarios={typedHomeScenarios}
          careerScenarios={typedCareerScenarios}
          educationScenarios={typedEducationScenarios}
          familyScenarios={typedFamilyScenarios}
          sabbaticalScenarios={typedSabbaticalScenarios}
          carScenarios={typedCarScenarios}
          apartmentListings={typedApartmentListings}
          expenseActuals={typedExpenseActuals}
          budgetHistory={typedBudgetHistory}
          estateProfile={typedEstateProfile}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}
