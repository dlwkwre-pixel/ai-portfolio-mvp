import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import CommunityClient from "./community-client";

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ style?: string; risk?: string; sort?: string; q?: string; feed?: string; section?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { style, risk, sort = "popular", q, feed = "all", section = "strategies" } = await searchParams;

  // Fetch public strategies
  let query = supabase
    .from("strategies")
    .select("id, name, description, style, risk_level, is_public, likes_count, copies_count, created_at, user_id")
    .eq("is_public", true)
    .eq("is_active", true);

  if (style) query = query.eq("style", style);
  if (risk) query = query.eq("risk_level", risk);
  if (q) query = query.ilike("name", `%${q}%`);
  if (sort === "popular") query = query.order("likes_count", { ascending: false });
  else if (sort === "newest") query = query.order("created_at", { ascending: false });
  else if (sort === "copied") query = query.order("copies_count", { ascending: false });

  const { data: strategies } = await query.limit(50);

  // Fetch profiles separately for the strategy authors
  const authorIds = [...new Set((strategies ?? []).map(s => s.user_id))];
  const { data: profiles } = authorIds.length > 0
    ? await supabase.from("user_profiles").select("id, username, display_name, avatar_color").in("id", authorIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  // Get current user's likes and saves
  const [{ data: myLikes }, { data: mySaves }, { data: myFollows }, { data: theyFollowMe }] = await Promise.all([
    supabase.from("strategy_likes").select("strategy_id").eq("user_id", user.id),
    supabase.from("strategy_saves").select("strategy_id").eq("user_id", user.id),
    supabase.from("user_follows").select("following_id").eq("follower_id", user.id),
    supabase.from("user_follows").select("follower_id").eq("following_id", user.id),
  ]);

  const likedIds = new Set((myLikes ?? []).map(l => l.strategy_id));
  const theyFollowMeIds = new Set((theyFollowMe ?? []).map(f => f.follower_id));
  const savedIds = new Set((mySaves ?? []).map(s => s.strategy_id));
  const followingIds = new Set((myFollows ?? []).map(f => f.following_id));

  // Get all portfolios for sidebar
  const { data: allPortfolios } = await supabase
    .from("portfolios").select("id, name, cash_balance, account_type")
    .eq("user_id", user.id).eq("is_active", true);

  // Filter by following feed
  const filteredStrategies = feed === "following"
    ? (strategies ?? []).filter(s => followingIds.has(s.user_id))
    : (strategies ?? []);

  // Following list
  let peopleRows: any[] = [];
  if (section === "following") {
    const followingIdsArray = [...followingIds];
    let people: any[] = [];
    if (followingIdsArray.length > 0) {
      let peopleQuery = supabase
        .from("user_profiles")
        .select("id, username, display_name, bio, avatar_color")
        .in("id", followingIdsArray);
      if (q) peopleQuery = peopleQuery.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
      const { data } = await peopleQuery.limit(100);
      people = data ?? [];
    }

    // Get follower counts for each person
    const peopleIds = (people ?? []).map(p => p.id);
    const { data: followerCounts } = peopleIds.length > 0
      ? await supabase.from("user_follows").select("following_id").in("following_id", peopleIds)
      : { data: [] };

    const followerCountMap = new Map<string, number>();
    for (const f of (followerCounts ?? [])) {
      followerCountMap.set(f.following_id, (followerCountMap.get(f.following_id) ?? 0) + 1);
    }

    peopleRows = (people ?? []).map(p => ({
      id: p.id,
      username: p.username,
      display_name: p.display_name,
      bio: p.bio,
      avatar_color: p.avatar_color ?? "#2563eb",
      followers_count: followerCountMap.get(p.id) ?? 0,
      is_following: followingIds.has(p.id),
      is_friend: followingIds.has(p.id) && theyFollowMeIds.has(p.id),
      is_self: p.id === user.id,
    }));
  }

  const strategyRows = filteredStrategies.map(s => ({
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
      username: profileMap.get(s.user_id)?.username ?? s.user_id.slice(0, 8),
      display_name: profileMap.get(s.user_id)?.display_name ?? null,
      avatar_color: profileMap.get(s.user_id)?.avatar_color ?? "#2563eb",
      is_following: followingIds.has(s.user_id),
      is_friend: followingIds.has(s.user_id) && theyFollowMeIds.has(s.user_id),
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
        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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
          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <CommunityClient
              strategies={strategyRows}
              currentUserId={user.id}
              initialSort={sort}
              initialStyle={style ?? ""}
              initialRisk={risk ?? ""}
              initialQuery={q ?? ""}
              initialFeed={feed}
              followingCount={followingIds.size}
              initialSection={section}
              peopleRows={peopleRows}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
