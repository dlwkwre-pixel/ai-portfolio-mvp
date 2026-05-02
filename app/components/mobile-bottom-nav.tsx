"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ── Icons ──────────────────────────────────────────────────────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}

function IconPortfolios({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  );
}

function IconResearch({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
  );
}

function IconStrategies({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
    </svg>
  );
}

function IconMore({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path fillRule="evenodd" d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" clipRule="evenodd" />
    </svg>
  );
}

function IconCommunity({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
    </svg>
  );
}

function IconLearn({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3z" />
      <path d="M3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}

// ── Nav config ─────────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: "/dashboard",   label: "Home",       Icon: IconHome },
  { href: "/portfolios",  label: "Portfolio",  Icon: IconPortfolios },
  { href: "/research",    label: "Research",   Icon: IconResearch },
  { href: "/strategies",  label: "Strategies", Icon: IconStrategies },
];

const MORE_ITEMS = [
  { href: "/community",       label: "Community", Icon: IconCommunity },
  { href: "/learn",           label: "Learn",     Icon: IconLearn },
  { href: "/settings/profile", label: "Profile",  Icon: IconProfile },
];

const PUBLIC_PAGES = ["/", "/login", "/signup", "/setup-username"];

// ── Component ──────────────────────────────────────────────────────────────────

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  if (PUBLIC_PAGES.includes(pathname)) return null;

  const isMoreActive = MORE_ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  return (
    <>
      {/* ── More backdrop ───────────────────────────────────────────────────── */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 58,
            background: "rgba(4,13,26,0.6)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
          }}
        />
      )}

      {/* ── More sheet ──────────────────────────────────────────────────────── */}
      {moreOpen && (
        <div
          className="bt-more-sheet"
          style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 59,
            background: "var(--sidebar-bg)",
            borderTop: "1px solid var(--border-subtle)",
            borderRadius: "18px 18px 0 0",
            paddingBottom: "calc(64px + env(safe-area-inset-bottom))",
            boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
          }}
        >
          {/* Drag handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
            <div style={{
              width: "36px", height: "4px", borderRadius: "2px",
              background: "var(--border)",
            }} />
          </div>

          {/* Sheet items */}
          {MORE_ITEMS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: "16px",
                  padding: "15px 24px",
                  textDecoration: "none",
                  color: active ? "var(--brand-blue)" : "var(--text-secondary)",
                  fontFamily: "var(--font-body)",
                  fontSize: "15px",
                  fontWeight: active ? 600 : 400,
                  borderBottom: "1px solid var(--border-subtle)",
                  transition: "background 0.12s",
                }}
              >
                <Icon active={active} />
                {label}
                {active && (
                  <div style={{
                    marginLeft: "auto", width: "6px", height: "6px",
                    borderRadius: "50%", background: "var(--brand-blue)",
                  }} />
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Bottom nav bar ──────────────────────────────────────────────────── */}
      <nav
        className="mobile-bottom-nav"
        style={{ display: "none" }}
        aria-label="Main navigation"
      >
        {PRIMARY_NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: "3px", flex: 1,
                padding: "6px 4px",
                textDecoration: "none",
                color: active ? "var(--brand-blue)" : "var(--text-muted)",
                minHeight: "44px",
                transition: "color 0.15s",
              }}
            >
              <Icon active={active} />
              <span style={{
                fontSize: "10px",
                fontWeight: active ? 600 : 400,
                fontFamily: "var(--font-body)",
                letterSpacing: "0.01em",
              }}>
                {label}
              </span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: "3px", flex: 1,
            padding: "6px 4px",
            background: "none", border: "none", cursor: "pointer",
            color: isMoreActive || moreOpen ? "var(--brand-blue)" : "var(--text-muted)",
            minHeight: "44px",
            transition: "color 0.15s",
          }}
          aria-label="More pages"
          aria-expanded={moreOpen}
        >
          <IconMore active={isMoreActive || moreOpen} />
          <span style={{
            fontSize: "10px",
            fontWeight: isMoreActive || moreOpen ? 600 : 400,
            fontFamily: "var(--font-body)",
            letterSpacing: "0.01em",
          }}>
            More
          </span>
        </button>
      </nav>
    </>
  );
}
