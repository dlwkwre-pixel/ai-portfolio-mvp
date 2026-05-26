import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ProfileSettingsClient from "./profile-settings-client";
import BadgesSection from "@/app/[username]/badges-section";

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_profiles").select("*").eq("id", user.id).maybeSingle();

  const { data: allPortfolios } = await supabase
    .from("portfolios").select("id, name, cash_balance, account_type")
    .eq("user_id", user.id).eq("is_active", true);

  const [{ count: followersCount }, { count: followingCount }] = await Promise.all([
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
  ]);

  const isAdmin = !!(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL);

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
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px", marginBottom: "12px" }}>
              Settings
            </h1>
            <div style={{ display: "flex", gap: "4px" }}>
              <a href="/settings/profile" style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500,
                color: "var(--text-primary)", textDecoration: "none",
                background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
              }}>Profile</a>
              <a href="/settings/emails" style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500,
                color: "var(--text-secondary)", textDecoration: "none",
                background: "transparent", transition: "all 0.15s",
              }}>Emails</a>
            </div>
          </div>
          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "32px", maxWidth: "640px" }}>
              <ProfileSettingsClient
                userId={user.id}
                email={user.email ?? ""}
                isAdmin={isAdmin}
                followersCount={followersCount ?? 0}
                followingCount={followingCount ?? 0}
                existingProfile={profile ? {
                  username: profile.username,
                  display_name: profile.display_name,
                  bio: profile.bio,
                  avatar_color: profile.avatar_color,
                  is_public: (profile as Record<string, unknown>).is_public as boolean ?? true,
                } : null}
              />
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "28px" }}>
                <BadgesSection userId={user.id} isOwnProfile={true} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
