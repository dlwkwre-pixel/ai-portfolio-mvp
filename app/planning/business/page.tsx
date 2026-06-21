import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import BusinessClient from "./business-client";

const LIQUID_CATEGORIES = new Set(["cash", "savings", "checking", "emergency_fund", "money_market"]);

export default async function BusinessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { data: balanceItems }, { data: portfolios }] = await Promise.all([
    supabase.from("financial_profiles").select("gross_monthly_income, net_monthly_override").eq("user_id", user.id).maybeSingle(),
    supabase.from("balance_sheet_items").select("category, value, is_liability").eq("user_id", user.id),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id),
  ]);

  const currentMonthlyIncome = Math.round(Number(profile?.net_monthly_override ?? profile?.gross_monthly_income ?? 0));
  const portfolioCash = (portfolios ?? []).reduce((s, p) => s + Number(p.cash_balance ?? 0), 0);
  const balanceLiquid = (balanceItems ?? []).filter((i) => !i.is_liability && LIQUID_CATEGORIES.has((i.category ?? "").toLowerCase())).reduce((s, i) => s + Number(i.value), 0);
  const liquidAssets = portfolioCash + balanceLiquid;

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <BusinessClient liquidAssets={Math.round(liquidAssets)} currentMonthlyIncome={currentMonthlyIncome} />
      </div>
    </div>
  );
}
