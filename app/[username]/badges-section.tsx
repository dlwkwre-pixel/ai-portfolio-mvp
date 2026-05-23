import { createClient as createAnonClient } from "@supabase/supabase-js";
import {
  BADGES, BADGE_MAP, TIER_COLOR, TIER_BG, TIER_BORDER,
  type Badge, type BadgeIcon,
} from "@/lib/badges/definitions";

// ── SVG icon library ──────────────────────────────────────────────────────────

function BadgeIcon({ icon, size = 22, color }: { icon: BadgeIcon; size?: number; color: string }) {
  const s = { width: size, height: size, flexShrink: 0 as const };
  switch (icon) {
    case "flame":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none">
          <path d="M12 2C12 2 9.5 6.5 9.5 9.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5c0-1.2-.5-2.4-.5-2.4S17.5 10 17.5 13.5a5.5 5.5 0 01-11 0c0-5 5.5-11.5 5.5-11.5z" fill={color} />
          <path d="M12 14.5c0 1.1-.9 2-2 2-.3 0-.6-.1-.9-.2.5 1.8 1.7 3 2.9 3s2.5-1.2 2.9-3c-.3.1-.6.2-.9.2-1.1 0-2-.9-2-2z" fill={color} opacity="0.6" />
        </svg>
      );
    case "rocket":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/>
          <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/>
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
        </svg>
      );
    case "graduation":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
      );
    case "chart-line":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
          <polyline points="16 7 22 7 22 13"/>
        </svg>
      );
    case "plus-circle":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      );
    case "sparkle":
      return (
        <svg {...s} viewBox="0 0 24 24" fill={color}>
          <path d="M14.187 8.096L15 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L21.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09L15 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L8.25 12l2.846-.813a4.5 4.5 0 003.09-3.09z"/>
          <path d="M8.5 5.25L9 3.75l.5 1.5a2.25 2.25 0 001.545 1.545L12.75 7.5l-1.705.455A2.25 2.25 0 009.5 9.5l-.5 1.5-.5-1.5A2.25 2.25 0 006.955 7.955L5.25 7.5l1.705-.455A2.25 2.25 0 008.5 5.25z" opacity="0.6"/>
        </svg>
      );
    case "cpu":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
          <rect x="9" y="9" width="6" height="6"/>
          <line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/>
          <line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/>
          <line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/>
          <line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>
        </svg>
      );
    case "check-circle":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
      );
    case "share":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      );
    case "users":
      return (
        <svg {...s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
      );
    case "star":
      return (
        <svg {...s} viewBox="0 0 24 24" fill={color}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      );
  }
}

// ── Lock icon (shown over locked badges) ──────────────────────────────────────

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}

// ── Tier label ────────────────────────────────────────────────────────────────

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", legendary: "Legendary",
};

// ── Single badge tile ─────────────────────────────────────────────────────────

function BadgeTile({
  badge,
  earned,
  earnedAt,
}: {
  badge: Badge;
  earned: boolean;
  earnedAt: string | null;
}) {
  const color    = earned ? TIER_COLOR[badge.tier] : "#334155";
  const bg       = earned ? TIER_BG[badge.tier]    : "rgba(255,255,255,0.02)";
  const border   = earned ? TIER_BORDER[badge.tier] : "rgba(255,255,255,0.06)";
  const boxShadow = earned && badge.tier === "legendary"
    ? `0 0 18px rgba(168,85,247,0.15)`
    : undefined;

  return (
    <div
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
        boxShadow,
        opacity: earned ? 1 : 0.55,
        transition: "opacity 0.15s",
      }}
      title={earned ? badge.description : badge.hint}
    >
      {!earned && (
        <div style={{
          position: "absolute",
          top: "8px",
          right: "8px",
          color: "#334155",
        }}>
          <LockIcon />
        </div>
      )}

      <div style={{
        width: "44px",
        height: "44px",
        borderRadius: "12px",
        background: earned ? `${color}18` : "rgba(255,255,255,0.03)",
        border: `1px solid ${earned ? `${color}25` : "rgba(255,255,255,0.05)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <BadgeIcon icon={badge.icon} size={22} color={color} />
      </div>

      <div>
        <p style={{
          fontSize: "11px",
          fontWeight: 600,
          color: earned ? "var(--text-primary, #f0f4ff)" : "#475569",
          letterSpacing: "-0.1px",
          lineHeight: 1.2,
          marginBottom: "2px",
        }}>
          {badge.name}
        </p>
        <p style={{
          fontSize: "9px",
          color: earned ? color : "#334155",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}>
          {earned ? TIER_LABEL[badge.tier] : badge.hint}
        </p>
        {earned && earnedAt && (
          <p style={{ fontSize: "9px", color: "#334155", marginTop: "2px" }}>
            {new Date(earnedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

type EarnedBadge = { badge_id: string; earned_at: string };

export default async function BadgesSection({
  userId,
  isOwnProfile,
}: {
  userId: string;
  isOwnProfile: boolean;
}) {
  // Use anon client so this works for public profile visitors too
  const supabase = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: rows } = await supabase
    .from("user_badges")
    .select("badge_id, earned_at")
    .eq("user_id", userId)
    .order("earned_at", { ascending: false });

  const earned = rows as EarnedBadge[] | null ?? [];
  const earnedMap = new Map(earned.map((r) => [r.badge_id, r.earned_at]));
  const earnedIds = new Set(earnedMap.keys());

  const earnedBadges = BADGES.filter((b) => earnedIds.has(b.id));
  const lockedBadges = BADGES.filter((b) => !earnedIds.has(b.id));

  // On other profiles, only show earned. On own profile, show full catalog.
  if (!isOwnProfile && earnedBadges.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{
            fontFamily: "var(--font-display, sans-serif)",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--text-primary, #f0f4ff)",
            letterSpacing: "-0.2px",
          }}>
            Achievements
          </h2>
          <p style={{ fontSize: "12px", color: "var(--text-tertiary, #475569)", marginTop: "1px" }}>
            {earnedBadges.length} of {BADGES.length} unlocked
          </p>
        </div>
      </div>

      {/* Earned badges — shown to everyone */}
      {earnedBadges.length > 0 ? (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
          gap: "10px",
        }}>
          {earnedBadges.map((b) => (
            <BadgeTile key={b.id} badge={b} earned earnedAt={earnedMap.get(b.id) ?? null} />
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary, #475569)", fontStyle: "italic" }}>
          No badges yet.
        </p>
      )}

      {/* Locked badges — own profile only */}
      {isOwnProfile && lockedBadges.length > 0 && (
        <div>
          <p style={{
            fontSize: "10px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#334155",
            marginBottom: "10px",
          }}>
            Locked ({lockedBadges.length})
          </p>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
            gap: "10px",
          }}>
            {lockedBadges.map((b) => (
              <BadgeTile key={b.id} badge={b} earned={false} earnedAt={null} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
