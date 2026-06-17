import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import RelocationClient from "./relocation-client";
import type { RelocationScenario } from "./relocation-actions";

export default async function RelocationPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: scenariosData }, { data: profile }, { data: cashFlowItems }, { data: portfolios }] = await Promise.all([
    supabase.from("relocation_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("financial_profiles").select("monthly_expenses, gross_monthly_income, net_monthly_override").eq("user_id", user.id).maybeSingle(),
    supabase.from("cash_flow_items").select("type, amount, frequency").eq("user_id", user.id),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id),
  ]);

  const toMonthly = (amt: number, freq: string) => {
    switch (freq) {
      case "weekly": return amt * 52 / 12;
      case "biweekly": return amt * 26 / 12;
      case "semimonthly": return amt * 2;
      case "quarterly": return amt / 3;
      case "annual": return amt / 12;
      default: return amt;
    }
  };

  const scenarios: RelocationScenario[] = (scenariosData ?? []) as RelocationScenario[];

  const incomeMonthly = profile?.net_monthly_override
    ? Number(profile.net_monthly_override)
    : profile?.gross_monthly_income
    ? Number(profile.gross_monthly_income)
    : (cashFlowItems ?? []).filter((i) => i.type === "income").reduce((s, i) => s + toMonthly(Number(i.amount), i.frequency), 0);

  const expensesMonthly = profile?.monthly_expenses
    ? Number(profile.monthly_expenses)
    : (cashFlowItems ?? []).filter((i) => i.type === "expense").reduce((s, i) => s + toMonthly(Number(i.amount), i.frequency), 0);

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({
    id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type,
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex">
        <Sidebar userEmail={user.email} portfolios={sidebarPortfolios} />
      </div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <RelocationClient
          scenarios={scenarios}
          prefillIncome={Math.round(incomeMonthly)}
          prefillExpenses={Math.round(expensesMonthly)}
        />
      </div>
    </div>
  );
}
