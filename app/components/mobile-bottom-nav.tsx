"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/dashboard",
    label: "Home",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    ),
  },
  {
    href: "/portfolios",
    label: "Portfolios",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    href: "/strategies",
    label: "Strategies",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/community",
    label: "Community",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
    ),
  },
  {
    href: "/settings/profile",
    label: "Profile",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav" style={{ display: "none" }}>
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "3px",
              padding: "6px 12px",
              textDecoration: "none",
              color: isActive ? "var(--brand-blue)" : "var(--text-muted)",
              transition: "color 0.15s",
              flex: 1,
            }}
          >
            {item.icon(isActive)}
            <span style={{
              fontSize: "10px",
              fontWeight: isActive ? 600 : 400,
              fontFamily: "var(--font-body)",
              letterSpacing: "0.02em",
            }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
