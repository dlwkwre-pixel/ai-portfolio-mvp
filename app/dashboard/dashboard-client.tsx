"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { savePortfolioOrder } from "./portfolio-order-actions";
import OnboardingModal from "@/app/onboarding/onboarding-modal";

type PortfolioRow = {
  id: string;
  name: string;
  account_type: string | null;
  accountTypeLabel: string;
  dotColor: string;
  totalValue: number;
  totalValueLabel: string;
  cashLabel: string;
  benchmarkSymbol: string;
  status: string | null;
  createdAt: string;
  aiRecs: { id: string; action_type: string | null; ticker: string | null; thesis: string | null; badgeClass: string; }[];
};

type FeedItem = {
  id: string; kind: "transaction" | "ai";
  portfolioName: string; portfolioId: string;
  title: string; occurredAt: string;
  amount: number | null; href: string; status: string | null;
};

function formatLocalDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMoney(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type OnboardingPortfolio = { id: string; name: string; account_type: string | null };
type OnboardingStrategy = { id: string; name: string; description: string | null; risk_level: string | null };

export default function DashboardClient({ portfolioRows: initialRows, archivedRows, feedItems, totalValue, totalValueLabel, strategiesCount, lastRunAt, showOnboarding, forceOnboarding, initialOnboardingStep, existingPortfolios, existingStrategies }: {
  portfolioRows: PortfolioRow[]; archivedRows: { id: string; name: string }[];
  feedItems: FeedItem[]; totalValue: number; totalValueLabel: string;
  strategiesCount: number; lastRunAt: string | null;
  showOnboarding?: boolean; forceOnboarding?: boolean; initialOnboardingStep?: number;
  existingPortfolios?: OnboardingPortfolio[]; existingStrategies?: OnboardingStrategy[];
}) {
  const [isPrivate, setIsPrivateState] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("bt-privacy-mode") === "true"; } catch { return false; }
  });

  function setIsPrivate(v: boolean | ((prev: boolean) => boolean)) {
    setIsPrivateState(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      try {
        localStorage.setItem("bt-privacy-mode", String(next));
        window.dispatchEvent(new CustomEvent("bt-privacy-change"));
      } catch {}
      return next;
    });
  }
  const [portfolioRows, setPortfolioRows] = useState(initialRows);
  const [reordering, setReordering] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [onboardingOpen, setOnboardingOpen] = useState(() => {
    if (!(showOnboarding ?? false)) return false;
    if (forceOnboarding) { try { localStorage.removeItem("bt-onboarding-done"); } catch {} return true; }
    try { return localStorage.getItem("bt-onboarding-done") !== "true"; } catch { return true; }
  });

  const hide = (v: string, m = false) => isPrivate ? (m ? "$••••••" : "••••••") : v;

  function move(id: string, dir: "up" | "down") {
    setPortfolioRows(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0 || (dir === "up" && idx === 0) || (dir === "down" && idx === prev.length - 1)) return prev;
      const next = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {onboardingOpen && (
        <OnboardingModal
          initialStep={initialOnboardingStep ?? 1}
          existingPortfolios={existingPortfolios ?? []}
          existingStrategies={existingStrategies ?? []}
          onClose={() => {
            try { localStorage.setItem("bt-onboarding-done", "true"); } catch {}
            setOnboardingOpen(false);
          }}
        />
      )}
      {/* Stats */}
      {/* Stats row with privacy toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
        <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Overview</p>
        <button
          type="button"
          onClick={() => setIsPrivate(p => !p)}
          className="bt-btn bt-btn-ghost bt-btn-sm"
          style={{ gap: "6px" }}
        >
          {isPrivate ? (
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd"/>
              <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
              <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd"/>
            </svg>
          )}
          {isPrivate ? "Show values" : "Privacy mode"}
        </button>
      </div>
      <div className="dashboard-stats-grid">
        {[
          { label: "Total Value", value: hide(totalValueLabel, true), sub: `${portfolioRows.length} portfolios` },
          { label: "Strategies", value: String(strategiesCount), sub: "active" },
          { label: "AI Pending", value: String(portfolioRows.reduce((s,p) => s + p.aiRecs.length, 0)), sub: "recommendations" },
          { label: "Last AI Run", value: formatLocalDateTime(lastRunAt), sub: "most recent", small: true },
        ].map(stat => (
          <div key={stat.label} className="bt-card" style={{ padding: "14px 16px" }}>
            <div className="label" style={{ marginBottom: "6px" }}>{stat.label}</div>
            <div className="dashboard-stat-value" style={{ fontFamily: stat.small ? "var(--font-body)" : "var(--font-mono)", fontSize: stat.small ? "12px" : "18px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: stat.small ? 0 : "-0.3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stat.value}</div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="dashboard-main-grid">
        {/* Portfolios */}
        <div className="bt-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div>
              <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Your Portfolios</h2>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Click to open · Reorder with arrows</p>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>

              <button type="button" onClick={() => reordering ? startSave(async () => { await savePortfolioOrder(portfolioRows.map(p => p.id)); setReordering(false); }) : setReordering(true)} disabled={isSaving} className="bt-btn bt-btn-ghost bt-btn-sm">
                {isSaving ? "Saving..." : reordering ? "Done" : "Reorder"}
              </button>
              <Link href="/portfolios" className="bt-btn bt-btn-ghost bt-btn-sm">View all</Link>
            </div>
          </div>

          <div className="bt-list-animate" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {portfolioRows.map((p, idx) => (
              <div key={p.id} className="bt-lift" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                <div className="portfolio-row-wrap">
                  <div className="portfolio-row-flex">
                    {reordering && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <button type="button" onClick={() => move(p.id, "up")} disabled={idx === 0} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px", opacity: idx === 0 ? 0.2 : 1 }}>
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z" clipRule="evenodd"/></svg>
                        </button>
                        <button type="button" onClick={() => move(p.id, "down")} disabled={idx === portfolioRows.length - 1} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "1px", opacity: idx === portfolioRows.length - 1 ? 0.2 : 1 }}>
                          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd"/></svg>
                        </button>
                      </div>
                    )}
                    <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: p.dotColor, flexShrink: 0, boxShadow: `0 0 5px ${p.dotColor}` }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        <span className="hidden sm:inline-flex" style={{ fontSize: "9px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "1px 6px", borderRadius: "var(--radius-full)", flexShrink: 0 }}>{p.accountTypeLabel}</span>
                        <span className="hidden sm:inline-flex" style={{ fontSize: "9px", color: "var(--text-muted)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "1px 6px", borderRadius: "var(--radius-full)", flexShrink: 0 }}>{p.benchmarkSymbol}</span>
                      </div>
                      <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>Cash: {hide(p.cashLabel, true)} · {new Date(p.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="portfolio-row-actions">
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{hide(p.totalValueLabel, true)}</div>
                    <Link href={`/portfolios/${p.id}`} className="bt-btn bt-btn-primary bt-btn-sm">Open →</Link>
                  </div>
                </div>
                {p.aiRecs.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 14px", background: "var(--violet-bg)" }}>
                    <div className="label" style={{ color: "var(--violet)", marginBottom: "6px" }}>✦ AI Recommendations</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {p.aiRecs.map(rec => (
                        <Link key={rec.id} href={`/portfolios/${p.id}?tab=ai`} style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", padding: "3px 4px", borderRadius: "5px" }}>
                          <span className={rec.badgeClass}>{(rec.action_type || "—").replace("_", " ")}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, color: "var(--text-primary)", flexShrink: 0 }}>{rec.ticker}</span>
                          {rec.thesis && <span style={{ fontSize: "10px", color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {rec.thesis}</span>}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {portfolioRows.length === 0 && (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>No active portfolios yet.</p>
                <Link href="/portfolios" className="bt-btn bt-btn-primary" style={{ display: "inline-flex", marginTop: "10px" }}>Create Portfolio</Link>
              </div>
            )}
          </div>

          {archivedRows.length > 0 && (
            <details style={{ marginTop: "10px" }}>
              <summary style={{ fontSize: "11px", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px 2px", listStyle: "none" }}>
                {archivedRows.length} archived
              </summary>
              <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {archivedRows.map(p => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", opacity: 0.5, background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{p.name}</span>
                    <Link href={`/portfolios/${p.id}`} style={{ fontSize: "11px", color: "var(--brand-blue)", textDecoration: "none" }}>View →</Link>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Activity feed */}
        <div className="bt-card" style={{ height: "fit-content" }}>
          <div style={{ marginBottom: "12px" }}>
            <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Activity</h2>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Trades and AI runs</p>
          </div>
          <div className="bt-list-animate" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {feedItems.length > 0 ? feedItems.map(item => (
              <Link key={item.id} href={item.href} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "9px 10px", borderRadius: "var(--radius-md)", textDecoration: "none", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", transition: "var(--transition-fast)" }}>
                <div style={{ width: "24px", height: "24px", borderRadius: "6px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.kind === "ai" ? "var(--violet-bg)" : "var(--card-bg)", color: item.kind === "ai" ? "var(--violet)" : "var(--text-tertiary)", marginTop: "1px" }}>
                  {item.kind === "ai" ? (
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/></svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 20 20" fill="currentColor"><path d="M13.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l4.293 4.293a1 1 0 01-1.414 1.414l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 0z"/></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
                  <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{item.portfolioName} · {formatLocalDateTime(item.occurredAt)}</p>
                </div>
                {item.amount !== null && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 500, flexShrink: 0, color: item.amount >= 0 ? "var(--green)" : "var(--red)" }}>
                    {isPrivate ? "$••••••" : (item.amount > 0 ? "+" : "") + formatMoney(item.amount)}
                  </span>
                )}
              </Link>
            )) : (
              <p style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "8px 0" }}>No recent activity.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
