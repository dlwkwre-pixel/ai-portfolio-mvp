import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import RetirementClient from "./retirement-client";
import { ageFromDob } from "../planning-utils";

export const metadata = { title: "Retirement Income — BuyTune Planning" };

export default async function RetirementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: profile }, { data: portfolios }] = await Promise.all([
    supabase.from("financial_profiles").select("date_of_birth, target_retirement_age, k401_current_balance, gross_monthly_income, filing_status").eq("user_id", user.id).maybeSingle(),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("is_active", true),
  ]);

  const prefill = {
    currentAge: ageFromDob(profile?.date_of_birth ?? null) ?? 45,
    retirementAge: profile?.target_retirement_age ?? 65,
    traditionalBalance: profile?.k401_current_balance != null ? Math.round(Number(profile.k401_current_balance)) : 0,
    grossMonthlyIncome: profile?.gross_monthly_income != null ? Number(profile.gross_monthly_income) : null,
    married: (profile?.filing_status ?? "single") === "married_filing_jointly",
  };

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <RetirementClient prefill={prefill} />
      </div>
    </div>
  );
}
