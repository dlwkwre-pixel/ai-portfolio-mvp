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
    <>
      <style>{`
        .streak-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px 4px 8px;
          border-radius: 8px;
          border: 1px solid rgba(251,146,60,0.2);
          background: rgba(251,146,60,0.06);
          cursor: default;
          user-select: none;
          transition: box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease;
        }
        .streak-badge:hover {
          box-shadow: 0 0 10px rgba(251,146,60,0.45), 0 0 22px rgba(251,146,60,0.18);
          border-color: rgba(251,146,60,0.5);
          background: rgba(251,146,60,0.11);
        }
        @keyframes flicker {
          0%   { transform: scaleY(1)    scaleX(1)    rotate(-1deg); }
          20%  { transform: scaleY(1.08) scaleX(0.96) rotate(1deg);  }
          40%  { transform: scaleY(0.94) scaleX(1.04) rotate(-2deg); }
          60%  { transform: scaleY(1.06) scaleX(0.97) rotate(1.5deg);}
          80%  { transform: scaleY(0.97) scaleX(1.02) rotate(-1deg); }
          100% { transform: scaleY(1)    scaleX(1)    rotate(0deg);  }
        }
        .streak-flame {
          transform-origin: center bottom;
          flex-shrink: 0;
          transition: filter 0.25s ease;
        }
        .streak-badge:hover .streak-flame {
          animation: flicker 0.55s ease-in-out infinite;
          filter: drop-shadow(0 0 4px rgba(251,146,60,0.8));
        }
      `}</style>

      <div className="streak-badge" title={`${streak}-day streak`}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          className="streak-flame"
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
    </>
  );
}
