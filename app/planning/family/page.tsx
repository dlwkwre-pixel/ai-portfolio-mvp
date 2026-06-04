import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import FamilyClient from "./family-client";
import type { FamilyScenario } from "./family-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import { ageFromDob } from "@/app/planning/planning-utils";

export default async function FamilyPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [
    { data: scenariosData },
    { data: profileData },
    { data: portfolios },
    { data: assumptionsData },
    { data: balanceItems },
  ] = await Promise.all([
    supabase
      .from("family_scenarios")
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
      .from("balance_sheet_items")
      .select("value, is_liability, category")
      .eq("user_id", user.id),
  ]);

  const scenarios: FamilyScenario[] = (scenariosData ?? []) as FamilyScenario[];

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
      }
    : null;

  const investmentReturn = assumptionsData ? Number(assumptionsData.return_rate) : 0.07;

  const portfolioCash = (portfolios ?? []).reduce((s, p) => s + Number(p.cash_balance ?? 0), 0);
  const totalAssets = (balanceItems ?? []).filter((i) => !i.is_liability).reduce((s, i) => s + Number(i.value), 0) + portfolioCash;
  const totalLiabilities = (balanceItems ?? []).filter((i) => i.is_liability).reduce((s, i) => s + Number(i.value), 0);
  const currentNetWorth = totalAssets - totalLiabilities;
  const LIQUID_CATS = new Set(["cash", "savings", "checking", "emergency_fund", "money_market"]);
  const balanceLiquid = (balanceItems ?? [])
    .filter((i) => !i.is_liability && LIQUID_CATS.has(((i as { category?: string }).category ?? "").toLowerCase()))
    .reduce((s, i) => s + Number(i.value), 0);
  const liquidAssets = portfolioCash + balanceLiquid;

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
        <FamilyClient
          scenarios={scenarios}
          profile={profile}
          defaultInvestmentReturn={investmentReturn}
          currentNetWorth={currentNetWorth}
          liquidAssets={liquidAssets}
          profileKids={profile?.kids_json ?? []}
        />
      </div>
    </div>
  );
}
