import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import CommunityClient from "./community-client";
import CommunityHeader from "./community-header";

const PAGE_SIZE = 50; // load 50; trending strips are separate top-4 queries

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{
    style?: string; risk?: string; sort?: string; q?: string;
    section?: string; psort?: string; prisk?: string; pq?: string; mine?: string;
  }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const {
    style, risk, sort = "popular", q,
    section = "strategies", psort = "popular", prisk = "", pq = "", mine = "",
  } = await searchParams;

  // ── All portfolios (sidebar) ─────────────────────────────────────────────────
  const { data: allPortfolios } = await supabase
    .from("portfolios").select("id, name, cash_balance, account_type")
    .eq("user_id", user.id).eq("is_active", true);

  // ── Social state + stats (batch) ─────────────────────────────────────────────
  const [
    { data: myLikes },
    { data: mySaves },
    { data: myFollows },
    { data: theyFollowMe },
    { count: strategiesCount },
    { count: portfoliosCount },
    { data: ownStrategiesRaw },
    { data: publishedPortfoliosRaw },
    { data: myPortfolioFollows },
  ] = await Promise.all([
    supabase.from("strategy_likes").select("strategy_id").eq("user_id", user.id),
    supabase.from("strategy_saves").select("strategy_id").eq("user_id", user.id),
    supabase.from("user_follows").select("following_id").eq("follower_id", user.id),
    supabase.from("user_follows").select("follower_id").eq("following_id", user.id),
    supabase.from("strategies").select("id", { count: "exact", head: true }).eq("is_public", true).eq("is_active", true),
    supabase.from("public_portfolios").select("id", { count: "exact", head: true }).eq("is_public", true),
    supabase.from("strategies").select("id, name, style, risk_level, is_public").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }),
    supabase.from("public_portfolios").select("source_portfolio_id").eq("owner_user_id", user.id).eq("is_public", true),
    supabase.from("portfolio_followers").select("public_portfolio_id").eq("follower_user_id", user.id),
  ]);

  const likedIds = new Set((myLikes ?? []).map(l => l.strategy_id));
  const savedIds = new Set((mySaves ?? []).map(s => s.strategy_id));
  const followingIds = new Set((myFollows ?? []).map(f => f.following_id));
  const theyFollowMeIds = new Set((theyFollowMe ?? []).map(f => f.follower_id));
  const followedPortfolioIds = new Set((myPortfolioFollows ?? []).map(f => f.public_portfolio_id));
  const publishedPortfolioIds = new Set(
    (publishedPortfoliosRaw ?? []).map(p => p.source_portfolio_id).filter(Boolean)
  );

  // ── Public strategies ─────────────────────────────────────────────────────────
  let stratQuery = supabase
    .from("strategies")
    .select("id, name, description, style, risk_level, is_public, likes_count, copies_count, created_at, user_id, finn_confidence")
    .eq("is_public", true)
    .eq("is_active", true);

  if (style) stratQuery = stratQuery.eq("style", style);
  if (risk)  stratQuery = stratQuery.eq("risk_level", risk);
  if (q)     stratQuery = stratQuery.ilike("name", `%${q}%`);
  if (mine === "true") stratQuery = stratQuery.eq("user_id", user.id);
  if (sort === "popular")    stratQuery = stratQuery.order("likes_count", { ascending: false });
  else if (sort === "newest") stratQuery = stratQuery.order("created_at", { ascending: false });
  else if (sort === "copied") stratQuery = stratQuery.order("copies_count", { ascending: false });
  else if (sort === "finn")   stratQuery = stratQuery.order("finn_confidence", { ascending: false, nullsFirst: false });

  const { data: strategiesRaw } = await stratQuery.limit(PAGE_SIZE);

  const authorIds = [...new Set((strategiesRaw ?? []).map(s => s.user_id))];
  const { data: profiles } = authorIds.length > 0
    ? await supabase.from("user_profiles").select("id, username, display_name, avatar_color").in("id", authorIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  const strategyRows = (strategiesRaw ?? []).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    style: s.style,
    risk_level: s.risk_level,
    likes_count: s.likes_count ?? 0,
    copies_count: s.copies_count ?? 0,
    finn_confidence: (s as { finn_confidence?: number | null }).finn_confidence ?? null,
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

  // ── Public portfolios ─────────────────────────────────────────────────────────
  let pubPortfolioQuery = supabase
    .from("public_portfolios")
    .select("id, public_name, public_description, risk_level, style, follower_count, copy_count, last_synced_at, owner_user_id, linked_strategy_id")
    .eq("is_public", true);

  if (prisk) pubPortfolioQuery = pubPortfolioQuery.eq("risk_level", prisk);
  if (pq)    pubPortfolioQuery = pubPortfolioQuery.ilike("public_name", `%${pq}%`);
  if (mine === "true") pubPortfolioQuery = pubPortfolioQuery.eq("owner_user_id", user.id);
  if (psort === "popular") pubPortfolioQuery = pubPortfolioQuery.order("follower_count", { ascending: false });
  else if (psort === "newest") pubPortfolioQuery = pubPortfolioQuery.order("last_synced_at", { ascending: false });
  else if (psort === "copied") pubPortfolioQuery = pubPortfolioQuery.order("copy_count", { ascending: false });

  const { data: pubPortfolios } = await pubPortfolioQuery.limit(PAGE_SIZE);

  const pubPortfolioIds = (pubPortfolios ?? []).map(p => p.id);
  const { data: pubHoldings } = pubPortfolioIds.length > 0
    ? await supabase
        .from("public_portfolio_holdings")
        .select("public_portfolio_id, ticker, company_name, allocation_pct, is_cash, display_order")
        .in("public_portfolio_id", pubPortfolioIds)
        .order("display_order", { ascending: true })
    : { data: [] };

  const holdingsMap = new Map<string, Array<{ ticker: string; company_name: string | null; allocation_pct: number; is_cash: boolean }>>();
  for (const h of (pubHoldings ?? [])) {
    const arr = holdingsMap.get(h.public_portfolio_id) ?? [];
    arr.push({ ticker: h.ticker, company_name: h.company_name, allocation_pct: Number(h.allocation_pct), is_cash: h.is_cash });
    holdingsMap.set(h.public_portfolio_id, arr);
  }

  const pubOwnerIds = [...new Set((pubPortfolios ?? []).map(p => p.owner_user_id))];
  const { data: pubOwnerProfiles } = pubOwnerIds.length > 0
    ? await supabase.from("user_profiles").select("id, username, display_name, avatar_color").in("id", pubOwnerIds)
    : { data: [] };
  const pubOwnerMap = new Map((pubOwnerProfiles ?? []).map(p => [p.id, p]));

  const totalCopies = (pubPortfolios ?? []).reduce((sum, p) => sum + (p.copy_count ?? 0), 0);

  const portfolioRows = (pubPortfolios ?? []).map(p => {
    const owner = pubOwnerMap.get(p.owner_user_id);
    return {
      id: p.id,
      public_name: p.public_name,
      public_description: p.public_description,
      risk_level: p.risk_level,
      style: p.style,
      follower_count: p.follower_count ?? 0,
      copy_count: p.copy_count ?? 0,
      last_synced_at: p.last_synced_at,
      is_own: p.owner_user_id === user.id,
      is_following: followedPortfolioIds.has(p.id),
      holdings: holdingsMap.get(p.id) ?? [],
      author: {
        user_id: p.owner_user_id,
        username: owner?.username ?? p.owner_user_id.slice(0, 8),
        display_name: owner?.display_name ?? null,
        avatar_color: owner?.avatar_color ?? "#2563eb",
        is_following: followingIds.has(p.owner_user_id),
      },
    };
  });

  // ── Trending strips (top 6 by copies) ────────────────────────────────────────
  const [
    { data: trendingStratsRaw }, { data: trendingPortsRaw },
    { data: lbStratsRaw }, { data: lbPortsRaw },
  ] = await Promise.all([
    supabase
      .from("strategies")
      .select("id, name, description, style, risk_level, copies_count, likes_count, user_id")
      .eq("is_public", true).eq("is_active", true)
      .order("copies_count", { ascending: false })
      .limit(6),
    supabase
      .from("public_portfolios")
      .select("id, public_name, risk_level, style, copy_count, follower_count, owner_user_id")
      .eq("is_public", true)
      .order("copy_count", { ascending: false })
      .limit(6),
    // Leaderboard: top 15 strategies by likes
    supabase
      .from("strategies")
      .select("id, name, style, risk_level, likes_count, copies_count, finn_confidence, user_id")
      .eq("is_public", true).eq("is_active", true)
      .order("likes_count", { ascending: false })
      .limit(15),
    // Leaderboard: top 10 portfolios by followers
    supabase
      .from("public_portfolios")
      .select("id, public_name, risk_level, follower_count, copy_count, owner_user_id")
      .eq("is_public", true)
      .order("follower_count", { ascending: false })
      .limit(10),
  ]);

  // Build a combined profile lookup (reuse existing maps + fetch any missing)
  const trendingMissingIds = [
    ...(trendingStratsRaw ?? []).map(s => s.user_id),
    ...(trendingPortsRaw ?? []).map(p => p.owner_user_id),
    ...(lbStratsRaw ?? []).map(s => s.user_id),
    ...(lbPortsRaw ?? []).map(p => p.owner_user_id),
  ].filter(id => !profileMap.has(id) && !pubOwnerMap.has(id));
  const uniqueMissing = [...new Set(trendingMissingIds)];
  const { data: trendingExtraProfiles } = uniqueMissing.length > 0
    ? await supabase.from("user_profiles").select("id, username, display_name, avatar_color").in("id", uniqueMissing)
    : { data: [] };
  const allProfileMap = new Map([
    ...profileMap,
    ...pubOwnerMap,
    ...(trendingExtraProfiles ?? []).map(p => [p.id, p] as [string, typeof p]),
  ]);

  const trendingStrategies = (trendingStratsRaw ?? []).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    style: s.style,
    risk_level: s.risk_level,
    copies_count: s.copies_count ?? 0,
    likes_count: s.likes_count ?? 0,
    is_liked: likedIds.has(s.id),
    is_saved: savedIds.has(s.id),
    is_own: s.user_id === user.id,
    author: {
      user_id: s.user_id,
      username: allProfileMap.get(s.user_id)?.username ?? s.user_id.slice(0, 8),
      display_name: allProfileMap.get(s.user_id)?.display_name ?? null,
      avatar_color: allProfileMap.get(s.user_id)?.avatar_color ?? "#2563eb",
      is_following: followingIds.has(s.user_id),
    },
  }));

  const trendingPortfolios = (trendingPortsRaw ?? []).map(p => ({
    id: p.id,
    public_name: p.public_name,
    risk_level: p.risk_level,
    style: p.style,
    copy_count: p.copy_count ?? 0,
    follower_count: p.follower_count ?? 0,
    author: {
      user_id: p.owner_user_id,
      username: allProfileMap.get(p.owner_user_id)?.username ?? p.owner_user_id.slice(0, 8),
      avatar_color: allProfileMap.get(p.owner_user_id)?.avatar_color ?? "#2563eb",
    },
  }));

  // ── Leaderboard data ──────────────────────────────────────────────────────────
  const leaderboardStrategies = (lbStratsRaw ?? []).map(s => ({
    id: s.id,
    name: s.name,
    style: s.style,
    risk_level: s.risk_level,
    likes_count: s.likes_count ?? 0,
    copies_count: s.copies_count ?? 0,
    finn_confidence: (s as { finn_confidence?: number | null }).finn_confidence ?? null,
    author: {
      user_id: s.user_id,
      username: allProfileMap.get(s.user_id)?.username ?? s.user_id.slice(0, 8),
      display_name: allProfileMap.get(s.user_id)?.display_name ?? null,
      avatar_color: allProfileMap.get(s.user_id)?.avatar_color ?? "#2563eb",
    },
  }));

  const leaderboardPortfolios = (lbPortsRaw ?? []).map(p => ({
    id: p.id,
    public_name: p.public_name,
    risk_level: p.risk_level,
    follower_count: p.follower_count ?? 0,
    copy_count: p.copy_count ?? 0,
    author: {
      user_id: p.owner_user_id,
      username: allProfileMap.get(p.owner_user_id)?.username ?? p.owner_user_id.slice(0, 8),
      avatar_color: allProfileMap.get(p.owner_user_id)?.avatar_color ?? "#2563eb",
    },
  }));

  // ── Share modal data ──────────────────────────────────────────────────────────
  const ownStrategies = (ownStrategiesRaw ?? []).map(s => ({
    id: s.id, name: s.name, style: s.style, risk_level: s.risk_level, is_public: s.is_public,
  }));
  const ownPortfolios = (allPortfolios ?? []).map(p => ({
    id: p.id, name: p.name,
    cash_balance: Number(p.cash_balance ?? 0),
    account_type: p.account_type,
  }));

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const stats = {
    strategies_count: strategiesCount ?? 0,
    portfolios_count: portfoliosCount ?? 0,
    total_copies: totalCopies,
  };

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

          <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
            <CommunityHeader
              stats={stats}
              ownStrategies={ownStrategies}
              ownPortfolios={ownPortfolios}
              publishedPortfolioIds={publishedPortfolioIds}
            />
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <CommunityClient
              strategies={strategyRows}
              currentUserId={user.id}
              initialSort={sort}
              initialStyle={style ?? ""}
              initialRisk={risk ?? ""}
              initialQuery={q ?? ""}
              initialSection={section}
              portfolios={portfolioRows}
              initialPSort={psort}
              initialPRisk={prisk}
              initialPQuery={pq}
              initialMine={mine === "true"}
              followingIds={[...followingIds]}
              trendingStrategies={trendingStrategies}
              trendingPortfolios={trendingPortfolios}
              leaderboardStrategies={leaderboardStrategies}
              leaderboardPortfolios={leaderboardPortfolios}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
