import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import CommunityClient from "./community-client";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string; risk?: string; sort?: string; q?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { style, risk, sort = "popular", q } = await searchParams;

  // Fetch public strategies with author profiles
  let query = supabase
    .from("strategies")
    .select(`
      id, name, description, style, risk_level, is_public,
      likes_count, copies_count, created_at, user_id,
      user_profiles!inner(username, display_name, avatar_color)
    `)
    .eq("is_public", true)
    .eq("is_active", true);

  if (style) query = query.eq("style", style);
  if (risk) query = query.eq("risk_level", risk);
  if (q) query = query.ilike("name", `%${q}%`);
  if (sort === "popular") query = query.order("likes_count", { ascending: false });
  else if (sort === "newest") query = query.order("created_at", { ascending: false });
  else if (sort === "copied") query = query.order("copies_count", { ascending: false });

  const { data: strategies } = await query.limit(50);

  // Get current user's likes and saves
  const [{ data: myLikes }, { data: mySaves }, { data: myFollows }] = await Promise.all([
    supabase.from("strategy_likes").select("strategy_id").eq("user_id", user.id),
    supabase.from("strategy_saves").select("strategy_id").eq("user_id", user.id),
    supabase.from("user_follows").select("following_id").eq("follower_id", user.id),
  ]);

  const likedIds = new Set((myLikes ?? []).map(l => l.strategy_id));
  const savedIds = new Set((mySaves ?? []).map(s => s.strategy_id));
  const followingIds = new Set((myFollows ?? []).map(f => f.following_id));

  // Get all portfolios for sidebar
  const { data: allPortfolios } = await supabase
    .from("portfolios").select("id, name, cash_balance, account_type")
    .eq("user_id", user.id).eq("is_active", true);

  const strategyRows = (strategies ?? []).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    style: s.style,
    risk_level: s.risk_level,
    likes_count: s.likes_count ?? 0,
    copies_count: s.copies_count ?? 0,
    created_at: s.created_at,
    is_own: s.user_id === user.id,
    is_liked: likedIds.has(s.id),
    is_saved: savedIds.has(s.id),
    author: {
      user_id: s.user_id,
      username: (s.user_profiles as any)?.username ?? "unknown",
      display_name: (s.user_profiles as any)?.display_name ?? null,
      avatar_color: (s.user_profiles as any)?.avatar_color ?? "#2563eb",
      is_following: followingIds.has(s.user_id),
    },
  }));

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            portfolios={(allPortfolios ?? []).map(p => ({
              id: p.id, name: p.name,
              cash_balance: Number(p.cash_balance ?? 0),
              account_type: p.account_type,
            }))}
          />
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                Community
              </h1>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                Discover and save public strategies from other investors
              </p>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <CommunityClient
              strategies={strategyRows}
              currentUserId={user.id}
              initialSort={sort}
              initialStyle={style ?? ""}
              initialRisk={risk ?? ""}
              initialQuery={q ?? ""}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
