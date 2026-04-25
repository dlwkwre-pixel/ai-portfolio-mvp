"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/portfolios", label: "Portfolios" },
  { href: "/strategies", label: "Strategies" },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <div style={{
      display: "flex",
      gap: "6px",
      overflowX: "auto",
      borderBottom: "1px solid var(--border-subtle)",
      background: "var(--sidebar-bg)",
      padding: "10px 16px",
      fontFamily: "var(--font-body)",
    }}
      className="lg:hidden"
    >
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
  );
}
