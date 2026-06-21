import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import InsuranceClient from "./insurance-client";

const LIQUID_CATEGORIES = new Set(["cash", "savings", "checking", "emergency_fund", "money_market"]);

export default async function InsurancePlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { data: balanceItems }, { data: portfolios }] = await Promise.all([
    supabase.from("financial_profiles").select("gross_monthly_income, net_monthly_override, kids_json").eq("user_id", user.id).maybeSingle(),
    supabase.from("balance_sheet_items").select("category, value, is_liability").eq("user_id", user.id),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id),
  ]);

  const annualIncome = Math.round(Number(profile?.gross_monthly_income ?? 0) * 12);
  const items = balanceItems ?? [];
  const mortgageBalance = items.filter((i) => i.is_liability && (i.category ?? "").toLowerCase() === "mortgage").reduce((s, i) => s + Number(i.value), 0);
  const totalLiabilities = items.filter((i) => i.is_liability).reduce((s, i) => s + Number(i.value), 0);
  const otherDebt = Math.max(0, totalLiabilities - mortgageBalance);
  const portfolioCash = (portfolios ?? []).reduce((s, p) => s + Number(p.cash_balance ?? 0), 0);
  const liquidSavings = portfolioCash + items.filter((i) => !i.is_liability && LIQUID_CATEGORIES.has((i.category ?? "").toLowerCase())).reduce((s, i) => s + Number(i.value), 0);
  const assetsTotal = items.filter((i) => !i.is_liability).reduce((s, i) => s + Number(i.value), 0) + portfolioCash;
  const netWorth = assetsTotal - totalLiabilities;
  const dependents = Array.isArray(profile?.kids_json) ? profile!.kids_json.length : 0;

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <InsuranceClient
          annualIncome={annualIncome}
          mortgageBalance={Math.round(mortgageBalance)}
          otherDebt={Math.round(otherDebt)}
          liquidSavings={Math.round(liquidSavings)}
          netWorth={Math.round(netWorth)}
          dependents={dependents}
        />
      </div>
    </div>
  );
}
