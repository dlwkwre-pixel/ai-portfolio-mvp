import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import EquityClient from "./equity-client";
import type { EquityGrant } from "./equity-actions";

export default async function EquityPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: grantsData }, { data: balanceItems }, { data: portfolios }] = await Promise.all([
    supabase.from("equity_grants").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then((r) => r, () => ({ data: null })),
    supabase.from("balance_sheet_items").select("value, is_liability").eq("user_id", user.id),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("status", "active"),
  ]);

  const grants: EquityGrant[] = (grantsData ?? []) as EquityGrant[];

  // Live prices for public tickers (graceful: a failed quote just omits that price).
  const tickers = Array.from(new Set(grants.map((g) => g.ticker).filter(Boolean) as string[]));
  const priceEntries = await Promise.all(tickers.map(async (t) => {
    try { const q = await getFinnhubQuote(t); return [t, q && q.c > 0 ? q.c : null] as const; }
    catch { return [t, null] as const; }
  }));
  const priceByTicker: Record<string, number> = {};
  for (const [t, p] of priceEntries) if (p != null) priceByTicker[t] = p;

  // Net worth (from the maintained balance sheet) for a concentration read.
  const otherNetWorth = (balanceItems ?? []).reduce(
    (s, i) => s + (i.is_liability ? -Number(i.value ?? 0) : Number(i.value ?? 0)), 0,
  );

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
        <EquityClient grants={grants} priceByTicker={priceByTicker} otherNetWorth={otherNetWorth} />
      </div>
    </div>
  );
}
