import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import GoalsClient from "./goals-client";
import type { Goal } from "./goals-actions";

export const metadata = { title: "Goals — BuyTune Planning" };

export default async function GoalsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: goalRows }, { data: portfolios }] = await Promise.all([
    supabase.from("planning_goals")
      .select("id, name, category, target_amount, current_amount, target_year, sort_order")
      .eq("user_id", user.id).order("sort_order", { ascending: true })
      .then((r) => r, () => ({ data: null })),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id),
  ]);

  const goals = (goalRows ?? []) as Goal[];
  const sidebarPortfolios = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <GoalsClient goals={goals} />
      </div>
    </div>
  );
}
