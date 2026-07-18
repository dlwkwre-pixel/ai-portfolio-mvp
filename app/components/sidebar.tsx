"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBlockedPages, sectionForHref } from "@/app/components/use-blocked-pages";
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SupportModal from "@/app/components/support-modal";
import { BrandGlyph } from "@/app/components/brand-mark";

type Portfolio = {
  id: string;
  name: string;
  cash_balance: number;
  account_type: string | null;
};

type SidebarProps = {
  userEmail?: string | null;
  totalValue?: number | null;
  totalChange?: number | null;
  totalChangePct?: number | null;
  portfolios?: Portfolio[];
  activePortfolioId?: string | null;
};

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    ),
  },
  {
    href: "/portfolios",
    label: "Portfolios",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    href: "/strategies",
    label: "Strategies",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/planning",
    label: "Planning",
    isNew: true,
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
        <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
      </svg>
    ),
  },
  {
    href: "/tax",
    label: "Tax Center",
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/connections",
    label: "Connections",
    isNew: true,
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M8.464 3.05a5 5 0 017.07 7.072l-1.768 1.767a1 1 0 01-1.414-1.414l1.768-1.768a3 3 0 10-4.243-4.243L8.11 6.234A1 1 0 116.696 4.82L8.464 3.05zm-3.535 3.535a1 1 0 011.414 1.415L4.575 9.768a3 3 0 104.243 4.243l1.768-1.768a1 1 0 111.414 1.414l-1.768 1.768a5 5 0 01-7.07-7.072l1.767-1.768z" />
      </svg>
    ),
  },
];

const discoverItems = [
  {
    href: "/research",
    label: "Research",
    isNew: false,
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: "/community",
    label: "Community",
    isNew: false,
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
      </svg>
    ),
  },
  {
    href: "/learn",
    label: "Learn",
    isNew: false,
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" />
      </svg>
    ),
  },
  {
    href: "/achievements",
    label: "Achievements",
    isNew: true,
    icon: (
      <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.364 1.118l1.287 3.957c.3.922-.755 1.688-1.54 1.118l-3.366-2.446a1 1 0 00-1.176 0l-3.366 2.446c-.784.57-1.838-.196-1.539-1.118l1.286-3.957a1 1 0 00-.363-1.118L2.05 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.957z" />
      </svg>
    ),
  },
];

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function accountTypeDot(type: string | null) {
  const t = (type || "").toLowerCase();
  if (["brokerage", "taxable"].includes(t)) return "#3b82f6";
  if (["roth_ira", "traditional_ira", "retirement"].includes(t)) return "#00d395";
  if (["margin", "speculative"].includes(t)) return "#f59e0b";
  if (["paper_trade", "paper trade"].includes(t)) return "#a78bfa";
  return "#64748b";
}

export default function Sidebar({
  userEmail,
  totalValue,
  totalChangePct,
  portfolios = [],
  activePortfolioId,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = useTransition();
  // Admin page denylist: blocked sections vanish from the nav for this account.
  const blockedPages = useBlockedPages();
  const [portfoliosOpen, setPortfoliosOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const [activeToday, setActiveToday] = useState(true);

  useEffect(() => {
    const read = () => {
      try { setIsPrivate(localStorage.getItem("bt-privacy-mode") === "true"); } catch {}
    };
    read();
    window.addEventListener("storage", read);
    window.addEventListener("bt-privacy-change", read);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("bt-privacy-change", read);
    };
  }, []);

  useEffect(() => {
    // Surface the login streak as a flame. Wrapped in a fn so setState isn't lexically
    // in the effect body (matches the codebase pattern; satisfies react-hooks rules).
    const loadStreak = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("user_profiles").select("login_streak, last_active_date").eq("id", user.id).maybeSingle();
        const row = data as { login_streak?: number | null; last_active_date?: string | null } | null;
        const today = new Date().toISOString().slice(0, 10);
        const last = row?.last_active_date ?? null;
        // Stale if last activity wasn't today or yesterday.
        const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
        const stale = last !== today && last !== yesterday;
        setStreak(stale ? 0 : (row?.login_streak ?? 0));
        setActiveToday(last === today);
      } catch { /* non-fatal */ }
    };
    void loadStreak();
  }, [supabase]);

  async function handleSignOut() {
    setSigningOut(async () => {
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    });
  }

  const username = userEmail?.split("@")[0] ?? "User";
  const initials = username.slice(0, 2).toUpperCase();
  const isAdmin = !!userEmail && !!process.env.NEXT_PUBLIC_ADMIN_EMAIL && userEmail === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  return (
    <aside style={{
      width: "220px",
      minWidth: "220px",
      background: "var(--sidebar-bg)",
      borderRight: "1px solid var(--sidebar-border)",
      display: "flex",
      flexDirection: "column",
      fontFamily: "var(--font-body)",
    }}>
      <style>{`
        .sb-nav-link { transition: background 0.13s ease, color 0.13s ease; }
        .sb-nav-link:hover:not(.sb-nav-link--active) {
          background: var(--surface-004) !important;
          color: var(--text-secondary) !important;
        }
        .sb-nav-link:hover:not(.sb-nav-link--active) span { opacity: 0.85 !important; }
        .sb-user-row { transition: background 0.13s ease; border-radius: 8px; }
        .sb-user-row:hover { background: var(--surface-005) !important; }
        .sb-signout:hover { background: var(--surface-004) !important; color: var(--text-secondary) !important; }
      `}</style>

      {/* Logo */}
      <div style={{
        padding: "18px 16px 14px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}>
        <div style={{
          width: "30px",
          height: "30px",
          background: "var(--brand-gradient)",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "var(--shadow-brand)",
        }}>
          <BrandGlyph size={16} />
        </div>
        <span style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "15px",
          color: "var(--text-primary)",
          letterSpacing: "-0.3px",
        }}>
          Buy<span style={{ color: "var(--brand-violet)" }}>Tune</span>.io
        </span>
      </div>

      {/* Portfolio value card */}
      {totalValue !== null && totalValue !== undefined && (
        <div style={{
          margin: "12px 10px",
          background: "rgba(37,99,235,0.08)",
          border: "1px solid rgba(37,99,235,0.16)",
          borderRadius: "10px",
          padding: "11px 13px",
        }}>
          <div className="label" style={{ marginBottom: "4px" }}>Total Portfolio</div>
          <div className="num" style={{ fontSize: "20px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
            {isPrivate ? "$••••••" : formatMoney(totalValue)}
          </div>
          {totalChangePct !== null && totalChangePct !== undefined && (
            <div style={{
              fontSize: "11px",
              color: totalChangePct >= 0 ? "var(--green)" : "var(--red)",
              marginTop: "2px",
              fontFamily: "var(--font-mono)",
            }}>
              {isPrivate ? "••••" : `${totalChangePct >= 0 ? "▲" : "▼"} ${Math.abs(totalChangePct).toFixed(2)}% all time`}
            </div>
          )}
        </div>
      )}

      {/* Streak flame */}
      {streak !== null && streak > 0 && (
        <Link href="/achievements" style={{
          margin: totalValue !== null && totalValue !== undefined ? "0 10px 10px" : "12px 10px 10px",
          display: "flex", alignItems: "center", gap: "9px", padding: "8px 11px",
          borderRadius: "10px", textDecoration: "none",
          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 2C12 2 9.5 6.5 9.5 9.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5c0-1.2-.5-2.4-.5-2.4S17.5 10 17.5 13.5a5.5 5.5 0 01-11 0c0-5 5.5-11.5 5.5-11.5z" fill="#f59e0b" />
            <path d="M12 14.5c0 1.1-.9 2-2 2-.3 0-.6-.1-.9-.2.5 1.8 1.7 3 2.9 3s2.5-1.2 2.9-3c-.3.1-.6.2-.9.2-1.1 0-2-.9-2-2z" fill="#fbbf24" />
          </svg>
          <div style={{ minWidth: 0, lineHeight: 1.25 }}>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
              {streak}-day streak
            </div>
            {!activeToday && (
              <div style={{ fontSize: "10px", color: "#f59e0b" }}>Check in to keep it</div>
            )}
          </div>
        </Link>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "4px 8px", display: "flex", flexDirection: "column", gap: "1px" }}>

        <div className="label" style={{ padding: "8px 8px 3px" }}>Workspace</div>

        {navItems.filter((item) => { const s = sectionForHref(item.href); return !s || !blockedPages.has(s); }).map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sb-nav-link${isActive ? " sb-nav-link--active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                padding: "8px 10px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--nav-active-text)" : "var(--text-tertiary)",
                background: isActive ? "var(--nav-active-bg)" : "transparent",
                border: `1px solid ${isActive ? "var(--nav-active-border)" : "transparent"}`,
                textDecoration: "none",
              }}
            >
              <span style={{ opacity: isActive ? 1 : 0.6, display: "flex" }}>{item.icon}</span>
              {item.label}
              {(item as { isNew?: boolean }).isNew && (
                <span className="bt-badge bt-badge-new" style={{ marginLeft: "auto" }}>NEW</span>
              )}
            </Link>
          );
        })}

        {/* Portfolio switcher */}
        {portfolios.length > 1 && (
          <div style={{ marginTop: "2px" }}>
            <button
              type="button"
              onClick={() => setPortfoliosOpen((p) => !p)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                color: "var(--text-muted)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
                transition: "var(--transition-fast)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"
                style={{ transform: portfoliosOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s ease" }}>
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
              {portfoliosOpen ? "Hide" : "Switch"} portfolio
            </button>

            {portfoliosOpen && portfolios.map((p) => (
              <Link
                key={p.id}
                href={`/portfolios/${p.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px 6px 20px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: p.id === activePortfolioId ? "var(--nav-active-text)" : "var(--text-secondary)",
                  background: p.id === activePortfolioId ? "var(--nav-active-bg)" : "transparent",
                  textDecoration: "none",
                  transition: "var(--transition-fast)",
                }}
              >
                <div style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: accountTypeDot(p.account_type),
                  flexShrink: 0,
                }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </Link>
            ))}
          </div>
        )}

        <div className="label" style={{ padding: "10px 8px 3px", marginTop: "4px" }}>Discover</div>

        {discoverItems.filter((item) => { const s = sectionForHref(item.href); return !s || !blockedPages.has(s); }).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sb-nav-link${isActive ? " sb-nav-link--active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                padding: "8px 10px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: isActive ? 500 : 400,
                color: isActive ? "var(--nav-active-text)" : "var(--text-tertiary)",
                background: isActive ? "var(--nav-active-bg)" : "transparent",
                border: `1px solid ${isActive ? "var(--nav-active-border)" : "transparent"}`,
                textDecoration: "none",
              }}
            >
              <span style={{ opacity: isActive ? 1 : 0.6, display: "flex" }}>{item.icon}</span>
              {item.label}
              {item.isNew && (
                <span className="bt-badge bt-badge-new" style={{ marginLeft: "auto" }}>NEW</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "10px 8px",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}>
        {/* User row */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Link href="/settings/profile" className="sb-user-row" style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "7px 10px",
            textDecoration: "none",
          }}>
            {/* Avatar */}
            <div style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "var(--brand-gradient)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              fontWeight: 600,
              color: "#fff",
              flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {username}
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Profile &amp; settings</div>
            </div>
          </Link>
        </div>

        {/* Support */}
        <SupportModal />

        {/* Admin (only visible to the admin account) */}
        {isAdmin && (
          <Link
            href="/admin"
            className="sb-signout"
            style={{
              width: "100%",
              padding: "7px 10px",
              borderRadius: "8px",
              fontSize: "12px",
              color: "var(--text-tertiary)",
              background: "none",
              border: "1px solid transparent",
              textDecoration: "none",
              fontFamily: "var(--font-body)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "background 0.13s ease, color 0.13s ease",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)" }}>
              <path fillRule="evenodd" d="M9.661 2.237a.531.531 0 01.678 0 11.947 11.947 0 007.078 2.749.5.5 0 01.479.425c.069.52.104 1.05.104 1.59 0 5.162-3.26 9.563-7.834 11.256a.48.48 0 01-.332 0C5.26 16.564 2 12.163 2 7c0-.538.035-1.069.104-1.589a.5.5 0 01.48-.425 11.947 11.947 0 007.077-2.75zm4.196 5.954a.75.75 0 00-1.214-.882l-3.236 4.53-1.55-1.55a.75.75 0 00-1.06 1.06l2.171 2.171a.75.75 0 001.143-.096l3.746-5.243z" clipRule="evenodd" />
            </svg>
            Admin
          </Link>
        )}

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="sb-signout"
          style={{
            width: "100%",
            padding: "7px 10px",
            borderRadius: "8px",
            fontSize: "12px",
            color: "var(--text-tertiary)",
            background: "none",
            border: "1px solid transparent",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: signingOut ? 0.6 : 1,
            transition: "background 0.13s ease, color 0.13s ease",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)" }}>
            <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
            <path fillRule="evenodd" d="M19 10a.75.75 0 00-.75-.75H8.704l1.048-1.048a.75.75 0 10-1.06-1.06l-2.25 2.25a.75.75 0 000 1.06l2.25 2.25a.75.75 0 101.06-1.06l-1.048-1.048h9.546A.75.75 0 0019 10z" clipRule="evenodd" />
          </svg>
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </aside>
  );
}
