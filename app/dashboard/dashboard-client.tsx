"use client";

import Link from "next/link";
import { useState } from "react";

type Stat = {
  label: string;
  value: string;
  sub: string;
  isMoney: boolean;
};

type PortfolioRow = {
  id: string;
  name: string;
  account_type: string | null;
  cash_balance: number;
  benchmark_symbol: string | null;
  created_at: string;
  status: string | null;
  style: { dot: string; badge: string };
  accountTypeLabel: string;
  cashLabel: string;
  dateLabel: string;
};

type FeedItem = {
  id: string;
  kind: "transaction" | "cash" | "ai";
  portfolioId: string;
  portfolioName: string;
  title: string;
  occurredAt: string;
  occurredAtLabel: string;
  amount: number | null;
  amountLabel: string | null;
  amountTone: "positive" | "negative" | "neutral";
  href: string;
  aiStatus?: string | null;
  statusBadgeClass: string | null;
};

type WorkspaceSnapshot = {
  account: string;
  activePortfolios: number;
  archivedPortfolios: number;
  totalCash: string;
  lastAiRun: string;
};

const kindIcon = {
  transaction: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M9.99 2a8 8 0 100 16 8 8 0 000-16zm.25 3.25a.75.75 0 00-1.5 0v.54a3.64 3.64 0 00-1.651.734C6.499 6.916 6 7.67 6 8.5c0 .83.499 1.584 1.089 2.005a4.28 4.28 0 001.661.755v2.516a1.867 1.867 0 01-.73-.28c-.287-.187-.52-.47-.52-.746a.75.75 0 00-1.5 0c0 .786.496 1.483 1.089 1.904a3.64 3.64 0 001.661.718v.578a.75.75 0 001.5 0v-.575a3.89 3.89 0 001.652-.756C12.499 14.584 13 13.83 13 13c0-.83-.499-1.584-1.098-2.005a4.44 4.44 0 00-1.652-.737V7.742c.26.066.503.181.73.28.287.187.52.47.52.728a.75.75 0 001.5 0c0-.786-.496-1.482-1.089-1.904A3.64 3.64 0 0010.24 6.29V5.25z" clipRule="evenodd" />
    </svg>
  ),
  cash: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M1 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-1 1H2a1 1 0 01-1-1V4zM1 10a1 1 0 011-1h6a1 1 0 110 2H2a1 1 0 01-1-1zM1 14a1 1 0 011-1h6a1 1 0 110 2H2a1 1 0 01-1-1z" />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z" />
    </svg>
  ),
};

export default function DashboardClient({
  stats,
  portfolioRows,
  archivedRows,
  unifiedFeed,
  workspaceSnapshot,
}: {
  stats: Stat[];
  portfolioRows: PortfolioRow[];
  archivedRows: { id: string; name: string }[];
  unifiedFeed: FeedItem[];
  workspaceSnapshot: WorkspaceSnapshot;
}) {
  const [isPrivate, setIsPrivate] = useState(false);

  const hide = (value: string, isMoney = false) => {
    if (!isPrivate) return value;
    return isMoney ? "$••••••" : "••••••";
  };

  return (
    <div>
      {/* Privacy toggle + stat cards */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-slate-600">Overview</p>
          <button
            type="button"
            onClick={() => setIsPrivate((p) => !p)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
              isPrivate
                ? "border-purple-500/30 bg-purple-500/15 text-purple-300"
                : "border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white"
            }`}
          >
            {isPrivate ? (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z" clipRule="evenodd" />
                  <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
                </svg>
                Privacy On
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41z" clipRule="evenodd" />
                </svg>
                Privacy
              </>
            )}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl p-5" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{hide(stat.value, stat.isMoney)}</p>
              <p className="mt-0.5 text-xs text-slate-600">{stat.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.9fr)]">
        <div className="space-y-5">

          {/* Active Portfolios */}
          <div className="card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Active Portfolios</h2>
                <p className="mt-0.5 text-sm text-slate-500">Accounts you are actively managing.</p>
              </div>
              <Link href="/portfolios" className="text-xs text-blue-400 transition hover:text-blue-300">View all →</Link>
            </div>

            <div className="mt-4 space-y-2.5">
              {portfolioRows.length > 0 ? (
                portfolioRows.map((portfolio) => (
                  <div key={portfolio.id} className="card-inner card-hover rounded-xl px-4 py-3.5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={`h-2 w-2 shrink-0 rounded-full ${portfolio.style.dot}`} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-white">{portfolio.name}</h3>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${portfolio.style.badge}`}>
                              {portfolio.accountTypeLabel}
                            </span>
                            <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-400">
                              {portfolio.benchmark_symbol || "SPY"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>Cash: {hide(portfolio.cashLabel, true)}</span>
                            <span>·</span>
                            <span>{portfolio.dateLabel}</span>
                            <span>·</span>
                            <span className="capitalize">{portfolio.status}</span>
                          </div>
                        </div>
                      </div>
                      <Link href={`/portfolios/${portfolio.id}`} className="cta-btn shrink-0 rounded-xl px-4 py-2 text-xs font-semibold text-white">
                        Open →
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="card-inner rounded-xl p-5">
                  <p className="text-sm text-slate-500">No active portfolios yet. Create one to start tracking.</p>
                </div>
              )}
            </div>

            {archivedRows.length > 0 && (
              <details className="mt-3 group">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-2 py-2 text-xs text-slate-500 transition hover:text-slate-300">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 transition group-open:rotate-90">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                  {archivedRows.length} archived portfolio{archivedRows.length !== 1 ? "s" : ""}
                </summary>
                <div className="mt-2 space-y-2">
                  {archivedRows.map((p) => (
                    <div key={p.id} className="card-inner flex items-center justify-between rounded-xl px-4 py-3 opacity-60">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-600" />
                        <p className="text-sm text-slate-400">{p.name}</p>
                      </div>
                      <Link href={`/portfolios/${p.id}`} className="text-xs text-slate-500 transition hover:text-slate-300">View →</Link>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Activity feed */}
          <div className="card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Activity Feed</h2>
                <p className="mt-0.5 text-sm text-slate-500">Trades, cash movements, and AI runs.</p>
              </div>
              <span className="text-xs text-slate-600">{unifiedFeed.length} items</span>
            </div>

            <div className="mt-3 flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Trade</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Cash</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />AI Run</span>
            </div>

            <div className="mt-3 space-y-2">
              {unifiedFeed.length > 0 ? (
                unifiedFeed.map((item) => (
                  <Link key={item.id} href={item.href}
                    className="card-inner card-hover flex items-start justify-between gap-3 rounded-xl px-4 py-3.5 transition">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                        item.kind === "ai" ? "bg-blue-500/15 text-blue-400"
                        : item.kind === "cash" ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-slate-500/15 text-slate-400"
                      }`}>
                        {kindIcon[item.kind]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-white">{item.title}</p>
                          {item.kind === "ai" && item.aiStatus && item.statusBadgeClass && (
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize ${item.statusBadgeClass}`}>
                              {item.aiStatus}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.portfolioName} · {item.occurredAtLabel}
                        </p>
                      </div>
                    </div>
                    {item.amountLabel !== null && (
                      <span className={`shrink-0 text-sm font-semibold ${
                        item.amountTone === "positive" ? "text-emerald-400"
                        : item.amountTone === "negative" ? "text-red-400"
                        : "text-slate-400"
                      }`}>
                        {isPrivate ? "$••••" : (item.amount !== null && item.amount > 0 ? "+" : "") + item.amountLabel}
                      </span>
                    )}
                  </Link>
                ))
              ) : (
                <div className="card-inner rounded-xl p-5">
                  <p className="text-sm text-slate-500">No recent activity yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="card rounded-2xl p-5">
            <h2 className="text-base font-semibold text-white">Workspace Snapshot</h2>
            <div className="mt-4 space-y-2">
              {[
                { label: "Account", value: workspaceSnapshot.account, isMoney: false },
                { label: "Active Portfolios", value: String(workspaceSnapshot.activePortfolios), isMoney: false },
                { label: "Archived Portfolios", value: String(workspaceSnapshot.archivedPortfolios), isMoney: false },
                { label: "Total Cash", value: workspaceSnapshot.totalCash, isMoney: true },
                { label: "Last AI Run", value: workspaceSnapshot.lastAiRun, isMoney: false },
              ].map((item) => (
                <div key={item.label} className="card-inner flex items-center justify-between rounded-xl px-4 py-3">
                  <p className="text-xs uppercase tracking-widest text-slate-500">{item.label}</p>
                  <p className="max-w-[55%] truncate text-right text-sm font-medium text-white">
                    {hide(item.value, item.isMoney)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="card rounded-2xl p-5">
            <h2 className="text-base font-semibold text-white">Quick Actions</h2>
            <div className="mt-4 grid gap-2">
              <Link href="/portfolios" className="cta-btn rounded-xl px-4 py-3 text-center text-sm font-semibold text-white">
                Open Portfolio Manager
              </Link>
              <Link href="/strategies" className="card-inner card-hover rounded-xl px-4 py-3 text-center text-sm font-medium text-slate-300 transition">
                Strategy Library →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
