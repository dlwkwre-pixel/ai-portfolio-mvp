"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NotificationCenter from "./notification-center";

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

function IconPlanning({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
      <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
    </svg>
  );
}

function IconTax({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? "0" : "1.5"}>
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}

// ── Nav config ─────────────────────────────────────────────────────────────────

type NavItem = { href: string; label: string; Icon: (p: { active: boolean }) => React.ReactElement };

// Master list of every destination available to the bottom bar / More sheet.
const ALL_ITEMS: NavItem[] = [
  { href: "/dashboard",        label: "Home",       Icon: IconHome },
  { href: "/portfolios",       label: "Portfolio",  Icon: IconPortfolios },
  { href: "/research",         label: "Research",   Icon: IconResearch },
  { href: "/strategies",       label: "Strategies", Icon: IconStrategies },
  { href: "/planning",         label: "Planning",   Icon: IconPlanning },
  { href: "/tax",              label: "Tax",        Icon: IconTax },
  { href: "/community",        label: "Community",  Icon: IconCommunity },
  { href: "/learn",            label: "Learn",      Icon: IconLearn },
  { href: "/settings/profile", label: "Profile",    Icon: IconProfile },
];

const DEFAULT_BAR = ["/dashboard", "/portfolios", "/research", "/strategies"];
const STORAGE_KEY = "bt-bottom-nav-v1";
const BAR_SLOTS = 4; // 4 destinations + the More button = 5 total

const PUBLIC_PAGES = ["/", "/login", "/signup", "/setup-username"];

function itemFor(href: string): NavItem | undefined {
  return ALL_ITEMS.find((i) => i.href === href);
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [barHrefs, setBarHrefs] = useState<string[]>(DEFAULT_BAR);

  // Load saved bar layout after mount (avoids SSR hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((h) => typeof h === "string" && itemFor(h));
          if (valid.length === BAR_SLOTS) setBarHrefs(valid);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Close sheet + exit edit mode on route change
  useEffect(() => { setMoreOpen(false); setEditing(false); }, [pathname]);

  if (PUBLIC_PAGES.includes(pathname)) return null;

  const barItems = barHrefs.map(itemFor).filter(Boolean) as NavItem[];
  const moreItems = ALL_ITEMS.filter((i) => !barHrefs.includes(i.href));

  const isMoreActive = moreItems.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  function persist(next: string[]) {
    setBarHrefs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  // Toggle an item's membership in the bar. Keeps exactly BAR_SLOTS:
  // adding a 5th drops the last-added; removing keeps a minimum of 1.
  function toggleBarItem(href: string) {
    if (barHrefs.includes(href)) {
      if (barHrefs.length <= 1) return;
      persist(barHrefs.filter((h) => h !== href));
    } else {
      const next = barHrefs.length >= BAR_SLOTS
        ? [...barHrefs.slice(0, BAR_SLOTS - 1), href]
        : [...barHrefs, href];
      persist(next);
    }
  }

  return (
    <>
      {/* ── More backdrop ───────────────────────────────────────────────────── */}
      {moreOpen && (
        <div
          onClick={() => { setMoreOpen(false); setEditing(false); }}
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
            paddingBottom: "calc(80px + env(safe-area-inset-bottom))",
            boxShadow: "0 -12px 40px rgba(0,0,0,0.5)",
            maxHeight: "80dvh",
            overflowY: "auto",
          }}
        >
          {/* Drag handle */}
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
            <div style={{
              width: "36px", height: "4px", borderRadius: "2px",
              background: "var(--border)",
            }} />
          </div>

          {/* Notifications + customize row */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "12px", padding: "8px 20px 12px",
            borderBottom: "1px solid var(--border-subtle)",
          }}>
            {editing ? (
              <span style={{
                fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em",
                textTransform: "uppercase", color: "var(--text-tertiary)",
                fontFamily: "var(--font-body)",
              }}>
                Pick up to {BAR_SLOTS} for your bar
              </span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 600, letterSpacing: "0.06em",
                  textTransform: "uppercase", color: "var(--text-tertiary)",
                  fontFamily: "var(--font-body)",
                }}>
                  Notifications
                </span>
                <NotificationCenter placement="up" />
              </div>
            )}
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              style={{
                display: "flex", alignItems: "center", gap: "6px",
                padding: "6px 11px", borderRadius: "var(--radius-full)",
                background: editing ? "var(--brand-blue)" : "var(--card-bg)",
                border: `1px solid ${editing ? "var(--brand-blue)" : "var(--card-border)"}`,
                color: editing ? "#fff" : "var(--text-secondary)",
                fontSize: "11px", fontWeight: 600, cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
            >
              {editing ? (
                "Done"
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  Edit bar
                </>
              )}
            </button>
          </div>

          {/* ── Edit mode: choose which destinations live on the bar ── */}
          {editing ? (
            <div style={{ padding: "12px 16px 4px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {ALL_ITEMS.map(({ href, label, Icon }) => {
                  const onBar = barHrefs.includes(href);
                  return (
                    <button
                      key={href}
                      type="button"
                      onClick={() => toggleBarItem(href)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        gap: "6px", padding: "12px 6px",
                        borderRadius: "var(--radius-md)",
                        background: onBar ? "rgba(37,99,235,0.1)" : "var(--card-bg)",
                        border: `1px solid ${onBar ? "var(--nav-active-border)" : "var(--card-border)"}`,
                        color: onBar ? "var(--brand-blue)" : "var(--text-secondary)",
                        cursor: "pointer", position: "relative",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      <Icon active={onBar} />
                      <span style={{ fontSize: "11px", fontWeight: onBar ? 600 : 400 }}>{label}</span>
                      {onBar && (
                        <span style={{
                          position: "absolute", top: "6px", right: "6px",
                          width: "14px", height: "14px", borderRadius: "50%",
                          background: "var(--brand-blue)", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p style={{ fontSize: "10px", color: "var(--text-muted)", textAlign: "center", padding: "12px 0 4px", fontFamily: "var(--font-body)" }}>
                Tap to add or remove. Home stays reachable from the bar or here.
              </p>
            </div>
          ) : (
            /* ── Normal mode: navigate to the off-bar destinations ── */
            moreItems.map(({ href, label, Icon }) => {
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
            })
          )}
        </div>
      )}

      {/* ── Bottom nav bar ──────────────────────────────────────────────────── */}
      <nav
        className="mobile-bottom-nav"
        style={{ display: "none" }}
        aria-label="Main navigation"
      >
        {barItems.map(({ href, label, Icon }) => {
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
