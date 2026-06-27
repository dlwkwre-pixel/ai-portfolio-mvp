"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/compliance", label: "Compliance" },
  { href: "/admin/notify", label: "Notifications" },
  { href: "/admin/feedback", label: "Feedback" },
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
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
