import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ProfileClient from "./profile-client";

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: { user: currentUser } } = await supabase.auth.getUser();

  // Find profile by username
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (!profile) notFound();

  const isOwnProfile = currentUser?.id === profile.id;

  // Get their public strategies
  const { data: strategies } = await supabase
    .from("strategies")
    .select("id, name, description, style, risk_level, likes_count, copies_count, created_at, is_public")
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .order("likes_count", { ascending: false });

  const publicStrategies = (strategies ?? []).filter(s => s.is_public || isOwnProfile);

  // Follower/following counts
  const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id),
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id),
  ]);

  // Is current user following this profile?
  let isFollowing = false;
  let myLikes: string[] = [];
  let mySaves: string[] = [];

  if (currentUser) {
    const [{ data: followRow }, { data: likes }, { data: saves }] = await Promise.all([
      supabase.from("user_follows").select("follower_id").eq("follower_id", currentUser.id).eq("following_id", profile.id).maybeSingle(),
      supabase.from("strategy_likes").select("strategy_id").eq("user_id", currentUser.id),
      supabase.from("strategy_saves").select("strategy_id").eq("user_id", currentUser.id),
    ]);
    isFollowing = !!followRow;
    myLikes = (likes ?? []).map(l => l.strategy_id);
    mySaves = (saves ?? []).map(s => s.strategy_id);
  }

  // Get allPortfolios for sidebar
  const { data: allPortfolios } = currentUser
    ? await supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", currentUser.id).eq("is_active", true)
    : { data: [] };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        {currentUser && (
          <div className="hidden lg:flex">
            <Sidebar
              userEmail={currentUser.email}
              portfolios={(allPortfolios ?? []).map(p => ({
                id: p.id, name: p.name,
                cash_balance: Number(p.cash_balance ?? 0),
                account_type: p.account_type,
              }))}
            />
          </div>
        )}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {currentUser && <MobileNav />}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 24px" }}>
            <ProfileClient
              profile={{
                id: profile.id,
                username: profile.username,
                display_name: profile.display_name,
                bio: profile.bio,
                avatar_color: profile.avatar_color,
                created_at: profile.created_at,
              }}
              strategies={publicStrategies.map(s => ({
                ...s,
                is_liked: myLikes.includes(s.id),
                is_saved: mySaves.includes(s.id),
                is_own: isOwnProfile,
              }))}
              followersCount={followersCount ?? 0}
              followingCount={followingCount ?? 0}
              isFollowing={isFollowing}
              isOwnProfile={isOwnProfile}
              isLoggedIn={!!currentUser}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
