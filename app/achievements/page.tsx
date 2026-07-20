import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import { BadgeIcon, LockIcon } from "@/app/components/badge-icon";
import InfoTooltip from "@/app/components/info-tooltip";
import ShareAchievements from "./share-achievements";
import {
  BADGES, BADGE_CATEGORY_ORDER, BADGE_CATEGORY_LABEL, TIER_LABEL,
  TIER_COLOR, TIER_BG, TIER_BORDER,
  type Badge, type BadgeCategory,
} from "@/lib/badges/definitions";
import { checkAndAwardBadges, getBadgeContext, badgeMetrics } from "@/lib/badges/check";
import { getUserXp, getRecentXpEvents, type LevelProgress, type XpEvent } from "@/lib/gamification/xp";
import { getWeeklyChallenges, type ChallengeState } from "@/lib/gamification/challenges";

export const dynamic = "force-dynamic";

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const day = 86_400_000;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Level medallion: a progress ring with the level inside ──────────────────────
function LevelMedallion({ p }: { p: LevelProgress }) {
  const r = 46, stroke = 9, c = 2 * Math.PI * r;
  const offset = c * (1 - p.pct / 100);
  return (
    <div style={{ position: "relative", width: "118px", height: "118px", flexShrink: 0 }}>
      <svg width="118" height="118" viewBox="0 0 118 118" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="59" cy="59" r={r} fill="none" stroke="var(--surface-010)" strokeWidth={stroke} />
        <defs>
          <linearGradient id="lvlring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
        <circle
          cx="59" cy="59" r={r} fill="none" stroke="url(#lvlring)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1px",
      }}>
        <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Level</span>
        <span style={{ fontSize: "34px", fontWeight: 800, lineHeight: 1, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{p.level}</span>
      </div>
    </div>
  );
}

function BadgeTile({ badge, earned, earnedAt, current }: {
  badge: Badge; earned: boolean; earnedAt: string | null; current: number;
}) {
  const color  = earned ? TIER_COLOR[badge.tier]  : "var(--text-muted)";
  const bg     = earned ? TIER_BG[badge.tier]     : "var(--surface-004)";
  const border = earned ? TIER_BORDER[badge.tier] : "var(--border-subtle)";
  const target = badge.progress?.target ?? 0;
  const pct    = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const showProgress = !earned && !!badge.progress && current > 0;

  return (
    <div
      className={earned ? "bt-ach-tile bt-ach-tile--earned" : "bt-ach-tile"}
      style={{
        position: "relative", display: "flex", flexDirection: "column", alignItems: "center",
        textAlign: "center", gap: "9px", padding: "16px 12px 13px", borderRadius: "14px",
        border: `1px solid ${border}`, background: bg,
        boxShadow: earned && badge.tier === "legendary" ? "0 0 18px rgba(168,85,247,0.15)" : undefined,
        opacity: earned ? 1 : 0.82, transition: "transform .18s ease, box-shadow .18s ease, opacity .15s",
        ["--tile-glow" as string]: color,
      }}
    >
      {!earned && (
        <div style={{ position: "absolute", top: "9px", right: "9px", color: "var(--text-muted)" }}>
          <LockIcon />
        </div>
      )}

      {/* How-to-earn tooltip — always available, even on progress/earned tiles */}
      <div style={{ position: "absolute", top: "7px", left: "7px", zIndex: 2 }}>
        <InfoTooltip text={`${badge.hint}${target > 0 && !earned ? ` (${current}/${target})` : ""}`} width={180} align="start">
          <span
            aria-label="How to earn this badge"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: "15px", height: "15px", borderRadius: "50%",
              fontSize: "10px", fontWeight: 700, lineHeight: 1, cursor: "help",
              color: earned ? color : "var(--text-tertiary)",
              background: "var(--surface-005)",
              border: `1px solid ${earned ? `${color}40` : "var(--border)"}`,
            }}
          >
            ?
          </span>
        </InfoTooltip>
      </div>

      <div className={earned ? "bt-ach-icon" : undefined} style={{
        width: "46px", height: "46px", borderRadius: "13px",
        background: earned ? `${color}18` : "var(--surface-005)",
        border: `1px solid ${earned ? `${color}25` : "var(--border-subtle)"}`,
        display: "flex", alignItems: "center", justifyContent: "center", transition: "transform .18s ease",
      }}>
        <BadgeIcon icon={badge.icon} size={23} color={color} />
      </div>

      <div style={{ width: "100%" }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: earned ? "var(--text-primary)" : "var(--text-secondary)", letterSpacing: "-0.1px", lineHeight: 1.2, marginBottom: "3px" }}>
          {badge.name}
        </p>
        <p style={{ fontSize: "10px", color: earned ? color : "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "4px" }}>
          {TIER_LABEL[badge.tier]}
        </p>

        {earned ? (
          <p style={{ fontSize: "10px", color: "var(--text-tertiary)", lineHeight: 1.35 }}>
            {earnedAt
              ? `Earned ${new Date(earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : "Unlocked"}
          </p>
        ) : showProgress ? (
          <div style={{ width: "100%", marginTop: "2px" }}>
            <div style={{ height: "5px", borderRadius: "3px", background: "var(--surface-006)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#0ea5a0,#3fae4a)" }} />
            </div>
            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
              {current} / {target}
            </p>
          </div>
        ) : (
          <p style={{ fontSize: "10px", color: "var(--text-tertiary)", lineHeight: 1.35 }}>{badge.hint}</p>
        )}
      </div>
    </div>
  );
}

export default async function AchievementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Award anything newly earned on visit (idempotent), then read state for display.
  // Challenges run first so any freshly-credited XP is reflected in the reads below.
  await checkAndAwardBadges(user.id);
  const { weekKey, challenges } = await getWeeklyChallenges(user.id);
  const challengesDone = challenges.filter((c) => c.done).length;

  const [portfoliosRes, badgeRows, profileRes, ctx, xp, events] = await Promise.all([
    supabase.from("portfolios")
      .select("id, name, cash_balance, account_type")
      .eq("user_id", user.id).eq("is_active", true),
    supabase.from("user_badges").select("badge_id, earned_at").eq("user_id", user.id),
    supabase.from("user_profiles").select("username").eq("id", user.id).maybeSingle(),
    getBadgeContext(user.id),
    getUserXp(user.id),
    getRecentXpEvents(user.id, 12),
  ]);

  const portfolios = portfoliosRes.data ?? [];
  const username = (profileRes.data as { username?: string | null } | null)?.username ?? null;
  const earnedMap = new Map((badgeRows.data ?? []).map((r) => [r.badge_id as string, r.earned_at as string]));
  const metrics = await badgeMetrics(ctx);
  const earnedCount = BADGES.filter((b) => earnedMap.has(b.id)).length;
  const toNext = Math.max(0, xp.nextLevelXp - xp.xp);

  // Rarest-first list of earned badge names for the share card.
  const tierRank: Record<string, number> = { legendary: 4, gold: 3, silver: 2, bronze: 1 };
  const topBadges = BADGES
    .filter((b) => earnedMap.has(b.id))
    .sort((a, b) => (tierRank[b.tier] ?? 0) - (tierRank[a.tier] ?? 0))
    .map((b) => b.name);

  const byCategory = BADGE_CATEGORY_ORDER
    .map((cat) => ({ cat, badges: BADGES.filter((b) => b.category === cat) }))
    .filter((g) => g.badges.length > 0);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            portfolios={portfolios.map((p) => ({
              id: p.id, name: p.name,
              cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type,
            }))}
          />
        </div>

        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
              Achievements
            </h1>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
              Your level, XP, and badges
            </p>
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "24px", maxWidth: "1100px", width: "100%", margin: "0 auto" }}>
            <style>{`
              .bt-ach-tile--earned:hover { transform: translateY(-3px) scale(1.03);
                box-shadow: 0 8px 24px color-mix(in srgb, var(--tile-glow) 30%, transparent), 0 0 0 1px color-mix(in srgb, var(--tile-glow) 25%, transparent) !important; opacity: 1 !important; }
              .bt-ach-tile--earned:hover .bt-ach-icon { transform: scale(1.1); }
            `}</style>

            {/* Level hero */}
            <section style={{
              display: "flex", alignItems: "center", gap: "22px", flexWrap: "wrap",
              padding: "22px 24px", borderRadius: "var(--radius-lg)",
              border: "1px solid var(--card-border)", background: "var(--card-bg)", marginBottom: "26px",
            }}>
              <LevelMedallion p={xp} />
              <div style={{ flex: 1, minWidth: "240px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.4px", fontFamily: "var(--font-display)" }}>
                    {xp.xp.toLocaleString()} XP
                  </span>
                  <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                    {toNext > 0 ? `${toNext.toLocaleString()} to Level ${xp.level + 1}` : "Max progress this tier"}
                  </span>
                </div>
                <div style={{ height: "9px", borderRadius: "5px", background: "var(--surface-006)", overflow: "hidden", margin: "12px 0 8px" }}>
                  <div style={{ width: `${xp.pct}%`, height: "100%", background: "linear-gradient(90deg,#0ea5a0,#3fae4a)", transition: "width .4s ease" }} />
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  You&apos;ve unlocked <strong style={{ color: "var(--text-primary)" }}>{earnedCount}</strong> of {BADGES.length} badges. Earn XP by adding holdings, running AI analyses, completing your profile, and showing up daily.
                </p>
              </div>
              <div style={{ marginLeft: "auto", alignSelf: "flex-start" }}>
                <ShareAchievements
                  level={xp.level}
                  xp={xp.xp}
                  earnedCount={earnedCount}
                  total={BADGES.length}
                  topBadges={topBadges}
                  username={username}
                />
              </div>
            </section>

            {/* Weekly challenges */}
            <section style={{ marginBottom: "28px" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
                <h2 style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                  This week&apos;s challenges
                </h2>
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                  {challengesDone}/{challenges.length} · resets {weekKey.replace(/^\d{4}-/, "")}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: "11px" }}>
                {challenges.map((c: ChallengeState) => (
                  <div key={c.id} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "14px 15px", borderRadius: "14px",
                    border: `1px solid ${c.done ? "rgba(16,185,129,0.28)" : "var(--card-border)"}`,
                    background: c.done ? "rgba(16,185,129,0.06)" : "var(--card-bg)",
                  }}>
                    <div style={{
                      width: "38px", height: "38px", borderRadius: "11px", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: c.done ? "rgba(16,185,129,0.14)" : "rgba(63,174,74,0.12)",
                      border: `1px solid ${c.done ? "rgba(16,185,129,0.3)" : "rgba(63,174,74,0.22)"}`,
                    }}>
                      <BadgeIcon icon={c.icon} size={19} color={c.done ? "#34d399" : "#5fbf9a"} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{c.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.35 }}>{c.description}</div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {c.done ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 700, color: "var(--green)", fontFamily: "var(--font-mono)" }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          +{c.xp}
                        </span>
                      ) : (
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>+{c.xp} XP</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent XP activity */}
            {events.length > 0 && (
              <section style={{ marginBottom: "28px" }}>
                <h2 style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "12px" }}>
                  Recent XP
                </h2>
                <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--card-bg)" }}>
                  {events.map((e: XpEvent, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                      padding: "11px 16px",
                      borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
                    }}>
                      <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{e.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                        <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{relTime(e.created_at)}</span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--accent, #159f6f)", fontFamily: "var(--font-mono)" }}>+{e.xp}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Badges by category */}
            {byCategory.map(({ cat, badges }: { cat: BadgeCategory; badges: Badge[] }) => {
              const catEarned = badges.filter((b) => earnedMap.has(b.id)).length;
              return (
                <section key={cat} style={{ marginBottom: "26px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "12px" }}>
                    <h2 style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.1px" }}>
                      {BADGE_CATEGORY_LABEL[cat]}
                    </h2>
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                      {catEarned}/{badges.length}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: "11px" }}>
                    {badges.map((b) => (
                      <BadgeTile
                        key={b.id}
                        badge={b}
                        earned={earnedMap.has(b.id)}
                        earnedAt={earnedMap.get(b.id) ?? null}
                        current={b.progress ? metrics[b.progress.metric] : 0}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {username && (
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", textAlign: "center", marginTop: "8px" }}>
                Badges also appear on your <Link href={`/${username}`} style={{ color: "var(--accent, #159f6f)" }}>public profile</Link>.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
