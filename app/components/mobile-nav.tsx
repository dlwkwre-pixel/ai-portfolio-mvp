"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationCenter from "./notification-center";
import SupportWidget from "./support-widget";
import { ThemeToggle } from "./theme-provider";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/strategies", label: "Strategies" },
  { href: "/research", label: "Research" },
  { href: "/tax", label: "Tax" },
  { href: "/planning", label: "Planning" },
  { href: "/connections", label: "Connections" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="hidden-mobile" style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      borderBottom: "1px solid var(--border-subtle)",
      // Light top bar — only the left sidebar is a dark panel in Sage; a dark
      // top bar too made the app read "double dark" (user QA 2026-07-20).
      background: "var(--bg-surface)",
      padding: "8px 12px",
      fontFamily: "var(--font-body)",
    }}>
      {/* Page tabs — scrollable */}
      <div style={{
        flex: 1,
        display: "flex",
        gap: "6px",
        overflowX: "auto",
        minWidth: 0,
      }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                flexShrink: 0,
                padding: "6px 14px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 500,
                textDecoration: "none",
                color: isActive ? "var(--nav-active-text)" : "var(--text-tertiary)",
                background: isActive ? "var(--nav-active-bg)" : "var(--card-bg)",
                border: `1px solid ${isActive ? "var(--nav-active-border)" : "var(--card-border)"}`,
                transition: "var(--transition-base)",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Right actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, paddingLeft: "4px" }}>
        <ThemeToggle />
        <SupportWidget />
        <NotificationCenter />

        <Link
          href="/settings/profile"
          aria-label="Profile"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            border: "1px solid var(--card-border)",
            background: "var(--card-bg)",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            textDecoration: "none",
            transition: "var(--transition-fast)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
