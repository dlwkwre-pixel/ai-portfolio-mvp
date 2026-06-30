import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import WatchlistClient from "./watchlist-client";
import { getFmpQuotes } from "@/lib/market-data/fmp";
import type { WatchlistItem } from "./watchlist-actions";

export const metadata = { title: "Watchlist — BuyTune Research" };
export const dynamic = "force-dynamic";

export type WatchQuote = { price: number; changePct: number };

export default async function WatchlistPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: rows }, { data: portfolios }] = await Promise.all([
    supabase.from("watchlist")
      .select("id, ticker, company_name, target_price, alert_direction, note, created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false })
      .then((r) => r, () => ({ data: null })),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("is_active", true),
  ]);

  const items = (rows ?? []).map((r) => ({ ...r, target_price: r.target_price != null ? Number(r.target_price) : null })) as WatchlistItem[];

  // One FMP call for every watched ticker's live price.
  const tickers = [...new Set(items.map((i) => i.ticker))];
  const prices: Record<string, WatchQuote> = {};
  if (tickers.length > 0) {
    try {
      const q = await getFmpQuotes(tickers);
      for (const [t, v] of q) prices[t] = { price: v.price, changePct: v.changesPercentage };
    } catch { /* prices optional */ }
  }

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <WatchlistClient items={items} prices={prices} />
      </div>
    </div>
  );
}
