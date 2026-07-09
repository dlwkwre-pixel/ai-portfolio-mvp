"use client";

// ─────────────────────────────────────────────────────────────────────────────
// PortfolioPulse — the "since your last visit" strip at the top of a portfolio.
// It turns tending the portfolio into a ritual: what moved since you were last
// here, and the ONE thing worth doing this visit. The since-last-visit deltas
// come from a localStorage price snapshot diffed against live prices (no backend
// table); everything else is served by /api/portfolios/[id]/pulse.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

type Mover = { ticker: string; company: string | null; pct: number };
type OneThing = { kind: string; label: string; detail: string; href: string; tone: "action" | "warn" | "info" };
type PulseData = {
  holdingsCount: number;
  movers: Mover[];
  prices: Record<string, number>;
  earnings: { ticker: string; date: string }[];
  dividends: { total: number; count: number };
  pendingRecs: number;
  latestRunId: string | null;
  journalDue: number;
  concentration: { ticker: string; pct: number } | null;
  oneThing: OneThing | null;
  asOf: string;
};

type Snapshot = { ts: number; prices: Record<string, number> };

const REANCHOR_MS = 45 * 60 * 1000; // keep the "last visit" anchor stable within a session

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

function relLabel(daysSince: number | null): string {
  if (daysSince == null) return "Your portfolio pulse";
  if (daysSince <= 0) return "Since earlier today";
  if (daysSince === 1) return "Since yesterday";
  if (daysSince < 7) return `Since ${daysSince} days ago`;
  if (daysSince < 30) return `Since ${Math.round(daysSince / 7)} weeks ago`;
  return "Since a while ago";
}

export default function PortfolioPulse({ portfolioId }: { portfolioId: string }) {
  const [data, setData] = useState<PulseData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hidden">("loading");
  const [sinceMovers, setSinceMovers] = useState<Mover[] | null>(null);
  const [daysSince, setDaysSince] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portfolios/${portfolioId}/pulse`, { cache: "no-store" });
        if (!res.ok) { if (!cancelled) setState("hidden"); return; }
        const d: PulseData = await res.json();
        if (cancelled) return;
        if (!d.holdingsCount) { setState("hidden"); return; }

        // Diff live prices against the last-visit snapshot for a true since-you-were-here delta.
        const key = `bt-pulse-${portfolioId}`;
        let snap: Snapshot | null = null;
        try { const raw = localStorage.getItem(key); if (raw) snap = JSON.parse(raw) as Snapshot; } catch { /* ignore */ }

        if (snap && snap.prices) {
          const days = Math.floor((Date.now() - snap.ts) / 86_400_000);
          setDaysSince(days);
          const deltas: Mover[] = [];
          for (const [ticker, cur] of Object.entries(d.prices)) {
            const old = snap.prices[ticker];
            if (old && old > 0) {
              const pct = ((cur - old) / old) * 100;
              if (Math.abs(pct) >= 0.1) {
                const co = d.movers.find((m) => m.ticker === ticker)?.company ?? null;
                deltas.push({ ticker, company: co, pct: Math.round(pct * 10) / 10 });
              }
            }
          }
          deltas.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
          setSinceMovers(deltas.slice(0, 3));
        }

        setData(d);
        setState("ready");

        // Re-anchor only after a gap, so repeated visits in one session still
        // report movement relative to the real last visit, not the last reload.
        if (!snap || Date.now() - snap.ts > REANCHOR_MS) {
          try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), prices: d.prices } satisfies Snapshot)); } catch { /* ignore */ }
        }
      } catch {
        if (!cancelled) setState("hidden");
      }
    })();
    return () => { cancelled = true; };
  }, [portfolioId]);

  if (state === "hidden") return null;
  if (state === "loading") {
    return <div className="h-[92px] animate-pulse rounded-2xl border border-white/6 bg-white/2" />;
  }
  if (!data) return null;

  const movers = (sinceMovers && sinceMovers.length > 0) ? sinceMovers : data.movers;
  const moversAreSince = !!(sinceMovers && sinceMovers.length > 0);
  const ot = data.oneThing;

  const toneRing = ot?.tone === "action" ? "border-blue-500/25 bg-blue-500/8"
    : ot?.tone === "warn" ? "border-amber-500/25 bg-amber-500/8"
    : "border-white/8 bg-white/3";
  const toneDot = ot?.tone === "action" ? "bg-blue-400"
    : ot?.tone === "warn" ? "bg-amber-400" : "bg-slate-400";

  return (
    <div className="rounded-2xl border border-white/6 bg-white/2 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {relLabel(daysSince)}
          </span>
        </div>
      </div>

      {/* Movers line */}
      {movers.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[10px] uppercase tracking-widest text-slate-600">
            {moversAreSince ? "Moved" : "Today"}
          </span>
          {movers.map((m) => {
            const up = m.pct >= 0;
            return (
              <span key={m.ticker} className="inline-flex items-center gap-1 text-sm" title={m.company ?? m.ticker}>
                <span className={up ? "text-emerald-400" : "text-red-400"}>{up ? "▲" : "▼"}</span>
                <span className="font-semibold text-slate-200">{m.ticker}</span>
                <span className={`tabular-nums ${up ? "text-emerald-400" : "text-red-400"}`}>{fmtPct(m.pct)}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* The one thing */}
      {ot && (
        <a href={ot.href}
          className={`group flex items-center gap-3 rounded-xl border ${toneRing} px-3 py-3 transition-colors hover:brightness-125`}>
          <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${toneDot}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">{ot.label}</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-400">{ot.detail}</span>
          </span>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
          </svg>
        </a>
      )}

      {/* Signal chips */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {data.pendingRecs > 0 && (
          <a href={`/portfolios/${portfolioId}?tab=ai`}
            className="rounded-lg border border-blue-500/20 bg-blue-500/8 px-2.5 py-1 text-xs font-medium text-blue-300 transition hover:bg-blue-500/15">
            {data.pendingRecs} to review
          </a>
        )}
        {data.journalDue > 0 && (
          <a href={`/portfolios/${portfolioId}?tab=journal`}
            className="rounded-lg border border-white/10 bg-white/3 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/6">
            {data.journalDue} reflection{data.journalDue === 1 ? "" : "s"} due
          </a>
        )}
        {data.earnings.length > 0 && (
          <span className="rounded-lg border border-white/10 bg-white/3 px-2.5 py-1 text-xs font-medium text-slate-300"
            title={data.earnings.map((e) => `${e.ticker} ${e.date}`).join(" · ")}>
            {data.earnings.length} earnings this week
          </span>
        )}
        {data.dividends.total > 0 && (
          <a href={`/portfolios/${portfolioId}?tab=income`}
            className="rounded-lg border border-emerald-500/15 bg-emerald-500/8 px-2.5 py-1 text-xs font-medium tabular-nums text-emerald-300 transition hover:bg-emerald-500/15">
            ${data.dividends.total.toLocaleString()} dividends
          </a>
        )}
      </div>
    </div>
  );
}
