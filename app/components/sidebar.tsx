"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/app/components/theme-provider";

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
];

const discoverItems = [
  {
    href: "/research",
    label: "Research",
    isNew: true,
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
  const [portfoliosOpen, setPortfoliosOpen] = useState(false);

  async function handleSignOut() {
    setSigningOut(async () => {
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    });
  }

  const username = userEmail?.split("@")[0] ?? "User";
  const initials = username.slice(0, 2).toUpperCase();

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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8" />
            <circle cx="5" cy="16" r="1.2" fill="white" stroke="none" />
            <circle cx="11" cy="12" r="1.2" fill="white" stroke="none" />
            <circle cx="16" cy="15" r="1.2" fill="white" stroke="none" />
            <circle cx="20" cy="7" r="1.2" fill="white" stroke="none" />
          </svg>
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
            {formatMoney(totalValue)}
          </div>
          {totalChangePct !== null && totalChangePct !== undefined && (
            <div style={{
              fontSize: "11px",
              color: totalChangePct >= 0 ? "var(--green)" : "var(--red)",
              marginTop: "2px",
              fontFamily: "var(--font-mono)",
            }}>
              {totalChangePct >= 0 ? "▲" : "▼"} {Math.abs(totalChangePct).toFixed(2)}% all time
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav style={{ flex: 1, padding: "4px 8px", display: "flex", flexDirection: "column", gap: "1px" }}>

        <div className="label" style={{ padding: "8px 8px 3px" }}>Workspace</div>

        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
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
                transition: "var(--transition-base)",
              }}
            >
              <span style={{ opacity: isActive ? 1 : 0.6, display: "flex" }}>{item.icon}</span>
              {item.label}
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

        {discoverItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
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
                transition: "var(--transition-base)",
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
        {/* User row — links to profile settings */}
        <Link href="/settings/profile" style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "7px 10px",
          borderRadius: "8px",
          textDecoration: "none",
          transition: "var(--transition-fast)",
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
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Edit profile</div>
          </div>
          <ThemeToggle />
        </Link>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
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
            transition: "var(--transition-fast)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: signingOut ? 0.6 : 1,
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
