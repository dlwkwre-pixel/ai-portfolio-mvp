import { createClient as createAnonClient } from "@supabase/supabase-js";
import {
  BADGES, TIER_COLOR, TIER_BG, TIER_BORDER,
  type Badge,
} from "@/lib/badges/definitions";
import { BadgeIcon, LockIcon } from "@/app/components/badge-icon";

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", legendary: "Legendary",
};

function BadgeTile({ badge, earned, earnedAt }: { badge: Badge; earned: boolean; earnedAt: string | null }) {
  const color   = earned ? TIER_COLOR[badge.tier] : "#334155";
  const bg      = earned ? TIER_BG[badge.tier]    : "rgba(255,255,255,0.02)";
  const border  = earned ? TIER_BORDER[badge.tier] : "rgba(255,255,255,0.06)";

  return (
    <div
      className={earned ? "bt-badge-tile bt-badge-tile--earned" : "bt-badge-tile bt-badge-tile--locked"}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "8px",
        padding: "14px 10px 12px",
        borderRadius: "14px",
        border: `1px solid ${border}`,
        background: bg,
        boxShadow: earned && badge.tier === "legendary" ? `0 0 18px rgba(168,85,247,0.15)` : undefined,
        opacity: earned ? 1 : 0.55,
        transition: "transform 0.18s ease, box-shadow 0.18s ease, opacity 0.15s",
        cursor: earned ? "default" : "default",
        // CSS custom property for glow color
        ["--tile-glow" as string]: color,
      }}
    >
      {!earned && (
        <div style={{ position: "absolute", top: "8px", right: "8px", color: "#334155" }}>
          <LockIcon />
        </div>
      )}

      <div style={{
        width: "44px", height: "44px", borderRadius: "12px",
        background: earned ? `${color}18` : "rgba(255,255,255,0.03)",
        border: `1px solid ${earned ? `${color}25` : "rgba(255,255,255,0.05)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "transform 0.18s ease",
      }} className={earned ? "bt-badge-icon" : undefined}>
        <BadgeIcon icon={badge.icon} size={22} color={color} />
      </div>

      <div>
        <p style={{ fontSize: "11px", fontWeight: 600, color: earned ? "var(--text-primary, #f0f4ff)" : "#475569", letterSpacing: "-0.1px", lineHeight: 1.2, marginBottom: "3px" }}>
          {badge.name}
        </p>
        <p style={{ fontSize: "10px", color: earned ? color : "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>
          {TIER_LABEL[badge.tier] ?? badge.tier}
        </p>
        {/* How it was earned — shown for both earned and locked */}
        <p style={{ fontSize: "10px", color: earned ? "#475569" : "#2d3748", lineHeight: 1.4, marginBottom: earned && earnedAt ? "2px" : 0 }}>
          {badge.hint}
        </p>
        {earned && earnedAt && (
          <p style={{ fontSize: "10px", color: "#334155", marginTop: "1px" }}>
            {new Date(earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}

type EarnedBadge = { badge_id: string; earned_at: string };

export default async function BadgesSection({ userId, isOwnProfile }: { userId: string; isOwnProfile: boolean }) {
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: rows } = await supabase
    .from("user_badges").select("badge_id, earned_at")
    .eq("user_id", userId).order("earned_at", { ascending: false });

  const earned = rows as EarnedBadge[] | null ?? [];
  const earnedMap = new Map(earned.map((r) => [r.badge_id, r.earned_at]));
  const earnedIds = new Set(earnedMap.keys());

  const earnedBadges = BADGES.filter((b) => earnedIds.has(b.id));
  const lockedBadges = BADGES.filter((b) => !earnedIds.has(b.id));

  if (!isOwnProfile && earnedBadges.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <style>{`
        .bt-badge-tile--earned:hover {
          transform: translateY(-3px) scale(1.03);
          box-shadow: 0 8px 24px color-mix(in srgb, var(--tile-glow) 30%, transparent), 0 0 0 1px color-mix(in srgb, var(--tile-glow) 25%, transparent) !important;
          opacity: 1 !important;
        }
        .bt-badge-tile--earned:hover .bt-badge-icon {
          transform: scale(1.1);
        }
        .bt-badge-tile--locked:hover {
          opacity: 0.7 !important;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display, sans-serif)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary, #f0f4ff)", letterSpacing: "-0.2px" }}>
            Achievements
          </h2>
          <p style={{ fontSize: "12px", color: "var(--text-tertiary, #475569)", marginTop: "1px" }}>
            {earnedBadges.length} of {BADGES.length} unlocked
          </p>
        </div>
      </div>

      {earnedBadges.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "10px" }}>
          {earnedBadges.map((b) => (
            <BadgeTile key={b.id} badge={b} earned earnedAt={earnedMap.get(b.id) ?? null} />
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary, #475569)", fontStyle: "italic" }}>No badges yet.</p>
      )}

      {isOwnProfile && lockedBadges.length > 0 && (
        <div>
          <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#334155", marginBottom: "10px" }}>
            Locked ({lockedBadges.length})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "10px" }}>
            {lockedBadges.map((b) => (
              <BadgeTile key={b.id} badge={b} earned={false} earnedAt={null} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
