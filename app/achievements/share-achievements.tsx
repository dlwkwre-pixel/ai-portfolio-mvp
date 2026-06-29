"use client";

import { useState } from "react";

export default function ShareAchievements({
  level, xp, earnedCount, total, topBadges, username,
}: {
  level: number;
  xp: number;
  earnedCount: number;
  total: number;
  topBadges: string[];
  username: string | null;
}) {
  const [state, setState] = useState<"idle" | "copied">("idle");

  const url = username
    ? `https://buytuneio.vercel.app/${username}`
    : "https://buytuneio.vercel.app";
  const topLine = topBadges.length ? ` Top unlocks: ${topBadges.slice(0, 3).join(", ")}.` : "";
  const text = `I'm Level ${level} on BuyTune with ${earnedCount}/${total} badges unlocked (${xp.toLocaleString()} XP).${topLine} Track your portfolio and level up your investing:`;

  async function onShare() {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title: "My BuyTune achievements", text, url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to clipboard
      }
    }
    try {
      await nav?.clipboard?.writeText(`${text} ${url}`);
      setState("copied");
      setTimeout(() => setState("idle"), 1900);
    } catch {
      // clipboard blocked — nothing else to do
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      style={{
        display: "inline-flex", alignItems: "center", gap: "7px",
        padding: "9px 15px", borderRadius: "11px", cursor: "pointer",
        fontSize: "12px", fontWeight: 600, letterSpacing: "-0.1px",
        color: state === "copied" ? "#34d399" : "var(--text-primary)",
        background: state === "copied" ? "rgba(16,185,129,0.10)" : "var(--card-bg)",
        border: `1px solid ${state === "copied" ? "rgba(16,185,129,0.32)" : "var(--card-border)"}`,
        transition: "background .15s ease, border-color .15s ease, color .15s ease",
        whiteSpace: "nowrap",
      }}
    >
      {state === "copied" ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
          Share badges
        </>
      )}
    </button>
  );
}
