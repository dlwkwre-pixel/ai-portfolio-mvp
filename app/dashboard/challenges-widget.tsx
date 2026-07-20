"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { BadgeIcon } from "@/app/components/badge-icon";

type Challenge = { id: string; label: string; description: string; xp: number; icon: string; done: boolean };
type Gami = { signedIn: boolean; level: number; pct: number; xp: number; nextLevelXp: number; challenges: Challenge[] };

// Compact "this week" challenges + level strip for the dashboard. Fetches client-side so it
// never blocks the dashboard's server render; the fetch also detects/credits completed quests.
export default function ChallengesWidget() {
  const [data, setData] = useState<Gami | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/gamification", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Gami) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data || !data.signedIn || data.challenges.length === 0) return null;

  const done = data.challenges.filter((c) => c.done).length;
  const toNext = Math.max(0, data.nextLevelXp - data.xp);

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>This week</span>
          <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{done}/{data.challenges.length} done</span>
        </div>
        <Link href="/achievements" style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent, #159f6f)", textDecoration: "none", flexShrink: 0 }}>
          Lv {data.level} · {toNext.toLocaleString()} to next →
        </Link>
      </div>

      {/* Level progress bar */}
      <div style={{ height: "5px", borderRadius: "3px", background: "var(--surface-008)", overflow: "hidden", marginBottom: "14px" }}>
        <div style={{ width: `${data.pct}%`, height: "100%", background: "linear-gradient(90deg,#0ea5a0,#3fae4a)" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "9px" }}>
        {data.challenges.map((c) => (
          <div key={c.id} style={{
            display: "flex", alignItems: "center", gap: "10px", padding: "9px 11px", borderRadius: "11px",
            border: `1px solid ${c.done ? "rgba(16,185,129,0.28)" : "var(--card-border)"}`,
            background: c.done ? "rgba(16,185,129,0.06)" : "var(--bg-elevated, rgba(255,255,255,0.02))",
          }}>
            <div style={{
              width: "30px", height: "30px", borderRadius: "9px", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: c.done ? "rgba(16,185,129,0.14)" : "rgba(63,174,74,0.12)",
              border: `1px solid ${c.done ? "rgba(16,185,129,0.3)" : "rgba(63,174,74,0.22)"}`,
            }}>
              <BadgeIcon icon={c.icon as Parameters<typeof BadgeIcon>[0]["icon"]} size={15} color={c.done ? "#34d399" : "#5fbf9a"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</div>
              <div style={{ fontSize: "10px", color: c.done ? "#34d399" : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {c.done ? "✓ done" : `+${c.xp} XP`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
