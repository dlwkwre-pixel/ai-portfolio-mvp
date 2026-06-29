import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ContributionsClient from "./contributions-client";
import type { ContributionSchedule } from "./contributions-actions";

export const metadata = { title: "Auto-Invest — BuyTune Planning" };

export default async function ContributionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: rows }, { data: portfolios }] = await Promise.all([
    supabase.from("contribution_schedules")
      .select("id, portfolio_id, label, amount, cadence, anchor_day, next_due, active")
      .eq("user_id", user.id).order("next_due", { ascending: true })
      .then((r) => r, () => ({ data: null })),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("is_active", true),
  ]);

  const schedules = (rows ?? []).map((r) => ({ ...r, amount: Number(r.amount ?? 0) })) as ContributionSchedule[];
  const sidebarPortfolios = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }));
  const portfolioOptions = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <ContributionsClient schedules={schedules} portfolios={portfolioOptions} />
      </div>
    </div>
  );
}
