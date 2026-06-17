import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import WeddingClient from "./wedding-client";
import type { WeddingScenario } from "./wedding-actions";

const LIQUID_CATEGORIES = new Set(["cash", "savings", "checking", "money_market"]);

export default async function WeddingPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: scenariosData }, { data: balanceItems }, { data: portfolios }] = await Promise.all([
    supabase.from("wedding_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("balance_sheet_items").select("category, value, is_liability").eq("user_id", user.id),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id),
  ]);

  const scenarios: WeddingScenario[] = (scenariosData ?? []) as WeddingScenario[];

  const portfolioCash = (portfolios ?? []).reduce((s, p) => s + Number(p.cash_balance ?? 0), 0);
  const balanceLiquid = (balanceItems ?? [])
    .filter((i) => !i.is_liability && LIQUID_CATEGORIES.has((i.category ?? "").toLowerCase()))
    .reduce((s, i) => s + Number(i.value), 0);
  const liquidAssets = Math.round(portfolioCash + balanceLiquid);

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
        <WeddingClient scenarios={scenarios} liquidAssets={liquidAssets} />
      </div>
    </div>
  );
}
