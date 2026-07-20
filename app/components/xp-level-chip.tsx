import Link from "next/link";
import { getUserXp } from "@/lib/gamification/xp";

// Compact level + XP-to-next-level chip for the dashboard header — the visible spine of the
// gamification loop. Server component: reads the user's XP (graceful level-1 baseline if none).
// Links to the Achievements hub.
export default async function XpLevelChip({ userId }: { userId: string }) {
  const p = await getUserXp(userId);
  const toNext = Math.max(0, p.nextLevelXp - p.xp);

  return (
    <Link
      href="/achievements"
      title={`${p.xp.toLocaleString()} XP · ${toNext.toLocaleString()} to level ${p.level + 1}`}
      style={{
        display: "flex", alignItems: "center", gap: "8px",
        padding: "4px 10px", borderRadius: "999px", textDecoration: "none",
        background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
      }}
    >
      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent, #159f6f)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
        Lv {p.level}
      </span>
      <div style={{ width: "44px", height: "5px", borderRadius: "3px", background: "var(--surface-010)", overflow: "hidden" }}>
        <div style={{ width: `${p.pct}%`, height: "100%", background: "linear-gradient(90deg,#0ea5a0,#3fae4a)" }} />
      </div>
    </Link>
  );
}
