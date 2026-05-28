import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import HomeClient from "./home-client";
import type { HomeScenario } from "./home-actions";
import type { FinancialProfile } from "@/app/planning/planning-actions";
import { ageFromDob } from "@/app/planning/planning-actions";

export default async function HomePlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [
    { data: scenariosData },
    { data: profileData },
    { data: portfolios },
    { data: assumptionsData },
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
        monthly_income: profileData.monthly_income ? Number(profileData.monthly_income) : null,
        monthly_expenses: profileData.monthly_expenses ? Number(profileData.monthly_expenses) : null,
        partner_name: profileData.partner_name ?? null,
        partner_age: profileData.partner_age ?? null,
        partner_target_retirement_age: profileData.partner_target_retirement_age ?? null,
        updated_at: profileData.updated_at,
      }
    : null;

  const investmentReturn = assumptionsData ? Number(assumptionsData.return_rate) : 0.07;

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
        />
      </div>
    </div>
  );
}
