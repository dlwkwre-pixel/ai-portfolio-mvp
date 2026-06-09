"use client";

import { useState, useTransition } from "react";
import { createHoldingLot, deleteHoldingLot } from "./actions";

export type HoldingLot = {
  id: string;
  holding_id: string;
  portfolio_id: string;
  ticker: string;
  purchased_at: string;
  shares: number;
  price_per_share: number;
  notes?: string | null;
};

type Props = {
  holdingId: string;
  portfolioId: string;
  ticker: string;
  lots: HoldingLot[];
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function HoldingLots({ holdingId, portfolioId, ticker, lots }: Props) {
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totalShares = lots.reduce((s, l) => s + Number(l.shares), 0);
  const totalCost = lots.reduce((s, l) => s + Number(l.shares) * Number(l.price_per_share), 0);
  const avgCost = totalShares > 0 ? totalCost / totalShares : 0;

  function handleAdd(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        await createHoldingLot(formData);
        setAdding(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add lot.");
      }
    });
  }

  function handleDelete(lotId: string) {
    setError("");
    startTransition(async () => {
      try {
        await deleteHoldingLot(lotId, portfolioId);
        setDeletingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete lot.");
      }
    });
  }

  return (
    <div className="mt-4 border-t border-white/8 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-widest text-slate-500">Purchase History</span>
          {lots.length > 0 && (
            <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
              {lots.length} lot{lots.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-[11px] text-blue-400 hover:text-blue-300 transition"
          >
            + Add lot
          </button>
        )}
      </div>

      {lots.length === 0 && !adding && (
        <p className="text-[11px] text-slate-600">
          No lots recorded. Add purchase dates here to fix the chart — each lot gets its own cash flow entry.
        </p>
      )}

      {lots.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-lg border border-white/8">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="px-3 py-1.5 text-left font-medium text-slate-500">Date</th>
                <th className="px-3 py-1.5 text-right font-medium text-slate-500">Shares</th>
                <th className="px-3 py-1.5 text-right font-medium text-slate-500">$/share</th>
                <th className="px-3 py-1.5 text-right font-medium text-slate-500">Total</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {lots
                .slice()
                .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at))
                .map((lot) => (
                  <tr key={lot.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition">
                    <td className="px-3 py-1.5 font-mono text-slate-300">{lot.purchased_at.slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-300">{Number(lot.shares).toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-300">{fmt(Number(lot.price_per_share))}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-300">
                      {fmt(Number(lot.shares) * Number(lot.price_per_share))}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {deletingId === lot.id ? (
                        <span className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDelete(lot.id)}
                            disabled={isPending}
                            className="text-red-400 hover:text-red-300 disabled:opacity-50 transition"
                          >
                            {isPending ? "…" : "Confirm"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(null)}
                            disabled={isPending}
                            className="text-slate-600 hover:text-slate-400 transition"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingId(lot.id)}
                          disabled={isPending}
                          className="text-slate-700 hover:text-red-400 transition"
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/8 bg-white/3">
                <td className="px-3 py-1.5 text-slate-500">Total</td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-400">{totalShares.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-500 text-[10px]">avg {fmt(avgCost)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-slate-300 font-medium">{fmt(totalCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {adding && (
        <form
          action={handleAdd}
          className="grid grid-cols-3 gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3"
        >
          <input type="hidden" name="holding_id" value={holdingId} />
          <input type="hidden" name="portfolio_id" value={portfolioId} />
          <input type="hidden" name="ticker" value={ticker} />

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500">Date</label>
            <input
              name="purchased_at"
              type="date"
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white outline-none focus:border-blue-500/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500">Shares</label>
            <input
              name="shares"
              type="number"
              step="0.000001"
              min="0.000001"
              placeholder="10"
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder-slate-600 outline-none focus:border-blue-500/60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500">Price/share</label>
            <input
              name="price_per_share"
              type="number"
              step="0.000001"
              min="0.000001"
              placeholder="185.50"
              required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder-slate-600 outline-none focus:border-blue-500/60"
            />
          </div>

          {error && (
            <p className="col-span-3 rounded-lg border border-red-500/20 bg-red-500/8 px-2 py-1.5 text-[11px] text-red-400">
              {error}
            </p>
          )}

          <div className="col-span-3 flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60 hover:bg-blue-500 transition"
            >
              {isPending ? "Saving…" : "Save lot"}
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setError(""); }}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
