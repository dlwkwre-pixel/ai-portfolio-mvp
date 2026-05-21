import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import CareerClient from "./career-client";
import type { CareerScenario } from "./career-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";

export default async function CareerPlanningPage() {
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
      .from("career_scenarios")
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

  const scenarios: CareerScenario[] = (scenariosData ?? []) as CareerScenario[];

  const profile: FinancialProfile | null = profileData
    ? {
        id: profileData.id,
        user_id: profileData.user_id,
        current_age: profileData.current_age ?? null,
        target_retirement_age: profileData.target_retirement_age ?? null,
        risk_tolerance: profileData.risk_tolerance ?? "moderate",
        monthly_income: profileData.monthly_income ? Number(profileData.monthly_income) : null,
        monthly_expenses: profileData.monthly_expenses ? Number(profileData.monthly_expenses) : null,
        partner_name: profileData.partner_name ?? null,
        partner_age: profileData.partner_age ?? null,
        partner_target_retirement_age: profileData.partner_target_retirement_age ?? null,
        updated_at: profileData.updated_at,
      }
    : null;

  const investmentReturn = assumptionsData ? Number(assumptionsData.return_rate) : 0.07;

  // Compute liquid assets: cash/savings balance sheet items + portfolio cash
  const portfolioCash = (portfolios ?? []).reduce((s, p) => s + Number(p.cash_balance ?? 0), 0);
  const LIQUID_CATEGORIES = new Set(["cash", "savings", "checking", "emergency_fund", "money_market"]);
  const balanceLiquid = (balanceItems ?? [])
    .filter((i) => !i.is_liability && LIQUID_CATEGORIES.has((i.category ?? "").toLowerCase()))
    .reduce((s, i) => s + Number(i.value), 0);
  const liquidAssets = portfolioCash + balanceLiquid;

  // Net worth from balance sheet + portfolio
  const totalAssets = (balanceItems ?? []).filter((i) => !i.is_liability).reduce((s, i) => s + Number(i.value), 0) + portfolioCash;
  const totalLiabilities = (balanceItems ?? []).filter((i) => i.is_liability).reduce((s, i) => s + Number(i.value), 0);
  const currentNetWorth = totalAssets - totalLiabilities;

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
        <CareerClient
          scenarios={scenarios}
          profile={profile}
          defaultInvestmentReturn={investmentReturn}
          liquidAssets={liquidAssets}
          currentNetWorth={currentNetWorth}
        />
      </div>
    </div>
  );
}
