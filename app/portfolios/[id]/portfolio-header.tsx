"use client";

import { useState } from "react";

type StatCard = {
  label: string;
  value: string;
  isMoney: boolean;
  highlight?: boolean;
};

type PortfolioHeaderProps = {
  portfolioName: string;
  portfolioDescription: string | null;
  accountTypeLabel: string;
  benchmarkSymbol: string;
  status: string | null;
  createdAt: string;
  styleDot: string;
  styleBadge: string;
  statCards: StatCard[];
};

export default function PortfolioHeader({
  portfolioName,
  portfolioDescription,
  accountTypeLabel,
  benchmarkSymbol,
  status,
  createdAt,
  styleDot,
  styleBadge,
  statCards,
}: PortfolioHeaderProps) {
  const [isPrivate, setIsPrivate] = useState(false);

  const hide = (value: string, isMoney: boolean) => {
    if (!isPrivate) return value;
    return isMoney ? "$••••••" : "••••••";
  };

  return (
    <div className="mb-5">
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className={`h-2.5 w-2.5 rounded-full ${styleDot}`} />
            <p className="text-xs font-medium uppercase tracking-widest text-blue-400">Portfolio</p>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{portfolioName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${styleBadge}`}>
              {accountTypeLabel}
            </span>
            <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] text-slate-400">
              {benchmarkSymbol}
            </span>
            <span className="rounded-full border border-white/8 bg-white/4 px-2 py-0.5 text-[10px] capitalize text-slate-400">
              {status}
            </span>
          </div>
          {portfolioDescription && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{portfolioDescription}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Privacy toggle */}
          <button
            type="button"
            onClick={() => setIsPrivate((p) => !p)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              isPrivate
                ? "border-purple-500/30 bg-purple-500/15 text-purple-300"
                : "border-white/10 bg-white/4 text-slate-400 hover:bg-white/8 hover:text-white"
            }`}
            title={isPrivate ? "Show values" : "Hide values"}
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
          <div className="text-sm text-slate-500">Created {createdAt}</div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-2xl p-5 ${stat.highlight ? "border border-blue-500/20 bg-blue-500/8" : ""}`}
            style={!stat.highlight ? { border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" } : {}}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-slate-500">{stat.label}</p>
            <p className={`mt-2 text-2xl font-semibold tracking-tight ${stat.highlight ? "text-blue-300" : "text-white"}`}>
              {hide(stat.value, stat.isMoney)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
