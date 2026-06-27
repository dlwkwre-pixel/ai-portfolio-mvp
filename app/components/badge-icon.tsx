import type { BadgeIcon as BadgeIconName } from "@/lib/badges/definitions";

// Shared badge glyph library. Used by the profile Achievements strip and the /achievements hub.
// Pure presentational — safe in any (server or client) tree.
export function BadgeIcon({ icon, size = 22, color }: { icon: BadgeIconName; size?: number; color: string }) {
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

export function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}
