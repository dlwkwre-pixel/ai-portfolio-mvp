"use client";

import { useEffect, useState } from "react";
import { recordDailyActivity } from "./streak-actions";

export default function StreakBadge({ initialStreak }: { initialStreak: number }) {
  const [streak, setStreak] = useState(initialStreak);

  useEffect(() => {
    recordDailyActivity().then((s) => {
      if (s > 0) setStreak(s);
    });
  }, []);

  if (streak === 0) return null;

  return (
    <div
      title={`${streak}-day streak`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 10px 4px 8px",
        borderRadius: "8px",
        border: "1px solid rgba(251,146,60,0.2)",
        background: "rgba(251,146,60,0.06)",
        cursor: "default",
        userSelect: "none",
      }}
    >
      {/* Flame icon */}
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M12 2C12 2 10 6 10 9c0 1.1.9 2 2 2s2-.9 2-2c0-1-.4-2-.4-2S17 9.5 17 13a5 5 0 01-10 0c0-4.5 5-11 5-11z"
          fill="#fb923c"
          opacity="0.9"
        />
        <path
          d="M12 14c0 1.1-.9 2-2 2-.5 0-1-.2-1.4-.5C9 17.5 10.4 19 12 19s3-1.5 3-3.5c0-1-.4-1.8-1-2.5 0 .3-.1.6-.1 1-.5 0-1-.45-1-1z"
          fill="#fbbf24"
          opacity="0.8"
        />
      </svg>

      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: "13px",
          fontWeight: 700,
          color: "#fb923c",
          letterSpacing: "-0.3px",
          lineHeight: 1,
        }}
      >
        {streak}
      </span>
      <span
        style={{
          fontSize: "11px",
          color: "var(--text-tertiary, #64748b)",
          lineHeight: 1,
        }}
      >
        {streak === 1 ? "day" : "days"}
      </span>
    </div>
  );
}
