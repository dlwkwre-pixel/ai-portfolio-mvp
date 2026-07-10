"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h6v8H3V3zm0 10h6v4H3v-4zm8 0h6v-8h-6v8zm0-10v4h6V3h-6z" /></svg>
  ),
  compliance: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.59 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 01-.332 0C5.26 16.564 2 12.163 2 7c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.077-2.75zm4.196 5.954a.75.75 0 00-1.214-.882l-3.236 4.53-1.55-1.55a.75.75 0 00-1.06 1.06l2.171 2.171a.75.75 0 001.143-.096l3.746-5.243z" clipRule="evenodd" /></svg>
  ),
  notifications: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.5 3.5 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zM8.05 14.943a33.54 33.54 0 003.9 0 2 2 0 01-3.9 0z" /></svg>
  ),
  feedback: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2c-4.418 0-8 2.91-8 6.5 0 1.62.73 3.09 1.94 4.22a4.5 4.5 0 01-1.36 1.97.75.75 0 00.49 1.31 6.5 6.5 0 003.5-1.06c1.04.36 2.18.56 3.43.56 4.418 0 8-2.91 8-6.5S14.418 2 10 2z" clipRule="evenodd" /></svg>
  ),
  connections: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M8.464 3.05a5 5 0 017.07 7.072l-1.768 1.767a1 1 0 01-1.414-1.414l1.768-1.768a3 3 0 10-4.243-4.243L8.11 6.234A1 1 0 116.696 4.82L8.464 3.05zm-3.535 3.535a1 1 0 011.414 1.415L4.575 9.768a3 3 0 104.243 4.243l1.768-1.768a1 1 0 111.414 1.414l-1.768 1.768a5 5 0 01-7.07-7.072l1.767-1.768z" /></svg>
  ),
  agreements: (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm5.707 6.707a1 1 0 00-1.414-1.414L7 10.586l-.293-.293a1 1 0 00-1.414 1.414l1 1a1 1 0 001.414 0l2-2z" clipRule="evenodd" /></svg>
  ),
};

const TABS = [
  { href: "/admin", label: "Overview", icon: "overview", exact: true },
  { href: "/admin/compliance", label: "Compliance", icon: "compliance" },
  { href: "/admin/agreements", label: "Agreements", icon: "agreements" },
  { href: "/admin/notify", label: "Notifications", icon: "notifications" },
  { href: "/admin/feedback", label: "Feedback", icon: "feedback" },
  { href: "/admin/connections", label: "Connections", icon: "connections" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
      <style>{`
        .adm-tab { transition: background .14s ease, color .14s ease, border-color .14s ease; }
        .adm-tab:hover:not(.adm-tab--active) { background: var(--surface-004, rgba(255,255,255,0.04)); color: var(--text-secondary); }
      `}</style>
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`adm-tab${active ? " adm-tab--active" : ""}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              padding: "7px 14px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: active ? 600 : 500,
              textDecoration: "none",
              color: active ? "#fff" : "var(--text-tertiary)",
              background: active ? "linear-gradient(135deg,#2563eb,#4f46e5)" : "transparent",
              border: `1px solid ${active ? "transparent" : "var(--border-subtle, rgba(255,255,255,0.1))"}`,
            }}
          >
            <span style={{ display: "flex", opacity: active ? 1 : 0.7 }}>{ICONS[t.icon]}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
