import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import EmergencyFundClient from "./emergency-fund-client";

const LIQUID_CATEGORIES = new Set(["cash", "savings", "checking", "emergency_fund", "money_market"]);

export default async function EmergencyFundPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { data: balanceItems }, { data: cashFlowItems }, { data: portfolios }] = await Promise.all([
    supabase.from("financial_profiles").select("monthly_expenses").eq("user_id", user.id).maybeSingle(),
    supabase.from("balance_sheet_items").select("category, value, is_liability").eq("user_id", user.id),
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

  const monthlyExpenses = profile?.monthly_expenses
    ? Number(profile.monthly_expenses)
    : (cashFlowItems ?? []).filter((i) => i.type === "expense").reduce((s, i) => s + toMonthly(Number(i.amount), i.frequency), 0);

  const portfolioCash = (portfolios ?? []).reduce((s, p) => s + Number(p.cash_balance ?? 0), 0);
  const balanceLiquid = (balanceItems ?? []).filter((i) => !i.is_liability && LIQUID_CATEGORIES.has((i.category ?? "").toLowerCase())).reduce((s, i) => s + Number(i.value), 0);
  const liquidAssets = portfolioCash + balanceLiquid;

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <EmergencyFundClient monthlyExpenses={Math.round(monthlyExpenses)} liquidAssets={Math.round(liquidAssets)} />
      </div>
    </div>
  );
}
