import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import StrategiesHub from "./strategies-hub";
import StrategyList from "./strategy-list";
import ArchivedSection from "./archived-section";
import type { StrategyRow, StrategyVersion, StrategyCard } from "./types";
import { getFinnProfile } from "./finn-profile-actions";
import FinnProfileCard from "./finn-profile-card";

export default async function StrategiesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: strategiesData, error } = await supabase
    .from("strategies").select("*").eq("user_id", user.id).eq("is_active", true)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const allStrategies: StrategyRow[] = (strategiesData ?? []) as StrategyRow[];

  // Split active vs archived client-side (avoids complex Supabase null/false OR query)
  const activeStrategies = allStrategies.filter(s => !s.is_archived);
  const archivedStrategies = allStrategies.filter(s => s.is_archived === true);

  const allIds = allStrategies.map((s) => s.id);
  const versionsByStrategyId = new Map<string, StrategyVersion[]>();
  const latestVersionsByStrategyId = new Map<string, StrategyVersion>();

  if (allIds.length > 0) {
    const { data: versionsData, error: versionsError } = await supabase
      .from("strategy_versions").select("*").in("strategy_id", allIds)
      .order("version_number", { ascending: false });
    if (versionsError) throw new Error(versionsError.message);
    for (const version of (versionsData ?? []) as StrategyVersion[]) {
      const existing = versionsByStrategyId.get(version.strategy_id) ?? [];
      existing.push(version);
      versionsByStrategyId.set(version.strategy_id, existing);
      if (!latestVersionsByStrategyId.has(version.strategy_id)) {
        latestVersionsByStrategyId.set(version.strategy_id, version);
      }
    }
  }

  function toCard(s: StrategyRow): StrategyCard {
    return {
      ...s,
      latest_version: latestVersionsByStrategyId.get(s.id) ?? null,
      version_history: versionsByStrategyId.get(s.id) ?? [],
    };
  }

  const activeCards = activeStrategies.map(toCard);
  const archivedCards = archivedStrategies.map(toCard);

  const newestIsNew = activeCards.length > 0
    && (Date.now() - new Date(activeCards[0].created_at).getTime()) < 30_000;

  const finnProfile = await getFinnProfile();

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar userEmail={user.email} />
        </div>
        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          {/* Topbar */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                Strategies
              </h1>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                Reusable investing frameworks that guide AI analysis
              </p>
            </div>
            {activeCards.length > 0 && (
              <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "3px 10px", borderRadius: "var(--radius-full)" }}>
                {activeCards.length} active
              </span>
            )}
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "24px" }}>

            <StrategiesHub />

            {/* FINN Investor Profile */}
            {finnProfile && (
              <FinnProfileCard profile={finnProfile} strategyCount={activeCards.length} />
            )}

            {/* Active strategy cards with compare mode */}
            {activeCards.length > 0 && (
              <StrategyList cards={activeCards} newestIsNew={newestIsNew} />
            )}

            {/* Archived strategies — collapsed toggle */}
            <ArchivedSection cards={archivedCards} />

          </div>
        </div>
      </div>
    </main>
  );
}
