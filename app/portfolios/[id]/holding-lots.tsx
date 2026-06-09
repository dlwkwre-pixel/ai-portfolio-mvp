"use client";

import { useState, useTransition } from "react";
import { createHoldingLot, updateHoldingLot, deleteHoldingLot } from "./actions";

export type HoldingLot = {
  id: string;
  holding_id: string;
  portfolio_id: string;
  ticker: string;
  lot_type: "BUY" | "SELL" | "DRIP";
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

type LotType = "BUY" | "SELL" | "DRIP";

const TYPE_STYLES: Record<LotType, string> = {
  BUY: "bg-emerald-500/15 text-emerald-400",
  SELL: "bg-red-500/15 text-red-400",
  DRIP: "bg-blue-500/15 text-blue-400",
};

function TypeToggle({ value, onChange }: { value: LotType; onChange: (t: LotType) => void }) {
  return (
    <div className="flex w-fit rounded-lg border border-white/10 p-0.5 text-[11px]">
      {(["BUY", "SELL", "DRIP"] as LotType[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-md px-3 py-1 font-medium transition ${
            value === t
              ? t === "SELL" ? "bg-red-500/20 text-red-400"
              : t === "DRIP" ? "bg-blue-500/20 text-blue-400"
              : "bg-emerald-500/20 text-emerald-400"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {t === "DRIP" ? "Dividend" : t === "BUY" ? "Buy" : "Sell"}
        </button>
      ))}
    </div>
  );
}

export function HoldingLots({ holdingId, portfolioId, ticker, lots }: Props) {
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<LotType>("BUY");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editType, setEditType] = useState<LotType>("BUY");
  const [editDate, setEditDate] = useState("");
  const [editShares, setEditShares] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const sorted = lots.slice().sort((a, b) => a.purchased_at.localeCompare(b.purchased_at));
  const totalBuyShares = lots.filter((l) => l.lot_type !== "SELL").reduce((s, l) => s + Number(l.shares), 0);
  const totalSellShares = lots.filter((l) => l.lot_type === "SELL").reduce((s, l) => s + Number(l.shares), 0);
  const netShares = totalBuyShares - totalSellShares;
  const totalCost = lots.filter((l) => l.lot_type !== "SELL").reduce((s, l) => s + Number(l.shares) * Number(l.price_per_share), 0);
  const avgCost = totalBuyShares > 0 ? totalCost / totalBuyShares : 0;

  function startEdit(lot: HoldingLot) {
    setEditingId(lot.id);
    setEditType(lot.lot_type);
    setEditDate(lot.purchased_at.slice(0, 10));
    setEditShares(String(Number(lot.shares)));
    setEditPrice(String(Number(lot.price_per_share)));
    setDeletingId(null);
    setError("");
  }

  function handleSaveEdit(lotId: string) {
    const shares = Number(editShares);
    const price = Number(editPrice);
    if (!editDate || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
      setError("Date, shares, and price are required and must be positive.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await updateHoldingLot(lotId, portfolioId, editType, editDate, shares, price);
        setEditingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Update failed.");
      }
    });
  }

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
          {lots.length > 0 && (
            <span className="text-[10px] text-slate-500">
              {netShares > 0 ? `${netShares.toLocaleString()} net shares` : "fully exited"}
            </span>
          )}
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="text-[11px] text-blue-400 hover:text-blue-300 transition">
            + Add lot
          </button>
        )}
      </div>

      {lots.length === 0 && !adding && (
        <p className="text-[11px] text-slate-600">
          No lots recorded. Add buy/sell entries here — the chart uses these for accurate share counts and cash flows.
        </p>
      )}

      {error && (
        <p className="mb-2 rounded-lg border border-red-500/20 bg-red-500/8 px-2 py-1.5 text-[11px] text-red-400">
          {error}
        </p>
      )}

      {lots.length > 0 && (
        <div className="mb-3 overflow-hidden rounded-lg border border-white/8">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-white/8 bg-white/3">
                <th className="px-3 py-1.5 text-left font-medium text-slate-500">Date</th>
                <th className="px-3 py-1.5 text-left font-medium text-slate-500">Type</th>
                <th className="px-3 py-1.5 text-right font-medium text-slate-500">Shares</th>
                <th className="px-3 py-1.5 text-right font-medium text-slate-500">$/share</th>
                <th className="px-3 py-1.5 text-right font-medium text-slate-500">Total</th>
                <th className="px-3 py-1.5 w-14" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((lot) => {
                const isSell = lot.lot_type === "SELL";

                if (editingId === lot.id) {
                  return (
                    <tr key={lot.id} className="border-b border-white/5 bg-blue-500/5">
                      <td colSpan={6} className="px-3 py-2">
                        <div className="flex flex-wrap items-end gap-2">
                          <TypeToggle value={editType} onChange={setEditType} />
                          <div>
                            <label className="mb-1 block text-[10px] text-slate-500 uppercase tracking-widest">Date</label>
                            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] text-white outline-none focus:border-blue-500/60" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-slate-500 uppercase tracking-widest">Shares</label>
                            <input type="number" step="0.000001" min="0.000001" value={editShares}
                              onChange={(e) => setEditShares(e.target.value)}
                              className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] text-white outline-none focus:border-blue-500/60" />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-slate-500 uppercase tracking-widest">$/share</label>
                            <input type="number" step="0.000001" min="0.000001" value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className="w-24 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] text-white outline-none focus:border-blue-500/60" />
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => handleSaveEdit(lot.id)} disabled={isPending}
                              className="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-60 hover:bg-blue-500 transition">
                              {isPending ? "Saving…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} disabled={isPending}
                              className="text-[11px] text-slate-500 hover:text-slate-300 transition">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={lot.id} className="border-b border-white/5 last:border-0 hover:bg-white/3 transition">
                    <td className="px-3 py-1.5 font-mono text-slate-300">{lot.purchased_at.slice(0, 10)}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${TYPE_STYLES[lot.lot_type]}`}>
                        {lot.lot_type}
                      </span>
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono ${isSell ? "text-red-400" : "text-slate-300"}`}>
                      {isSell ? "-" : ""}{Number(lot.shares).toLocaleString()}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-slate-300">{fmt(Number(lot.price_per_share))}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${isSell ? "text-red-400" : "text-slate-300"}`}>
                      {isSell ? "-" : ""}{fmt(Number(lot.shares) * Number(lot.price_per_share))}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-2">
                        {deletingId === lot.id ? (
                          <>
                            <button type="button" onClick={() => handleDelete(lot.id)} disabled={isPending}
                              className="text-[10px] text-red-400 hover:text-red-300 disabled:opacity-50 transition">
                              {isPending ? "…" : "Remove"}
                            </button>
                            <button type="button" onClick={() => setDeletingId(null)} disabled={isPending}
                              className="text-[10px] text-slate-600 hover:text-slate-400 transition">
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEdit(lot)} disabled={isPending} title="Edit"
                              className="text-slate-600 hover:text-slate-300 transition">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button type="button" onClick={() => setDeletingId(lot.id)} disabled={isPending} title="Delete"
                              className="text-slate-700 hover:text-red-400 transition">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lots.length > 1 && (
              <tfoot>
                <tr className="border-t border-white/8 bg-white/3">
                  <td className="px-3 py-1.5 text-slate-500" colSpan={2}>Net position</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-300">{netShares.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-500 text-[10px]">avg {fmt(avgCost)}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-slate-300 font-medium">{fmt(totalCost)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {adding && (
        <form action={handleAdd}
          className="grid grid-cols-2 gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 sm:grid-cols-4">
          <input type="hidden" name="holding_id" value={holdingId} />
          <input type="hidden" name="portfolio_id" value={portfolioId} />
          <input type="hidden" name="ticker" value={ticker} />
          <input type="hidden" name="lot_type" value={addType} />

          <div className="col-span-2 sm:col-span-4">
            <TypeToggle value={addType} onChange={setAddType} />
            {addType === "DRIP" && (
              <p className="mt-1 text-[10px] text-slate-500">
                Dividend reinvested — adds shares at the reinvestment price. For cash dividends, use Add Cash Activity → Dividend.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500">Date</label>
            <input name="purchased_at" type="date" required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white outline-none focus:border-blue-500/60" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500">Shares</label>
            <input name="shares" type="number" step="0.000001" min="0.000001" placeholder="10" required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder-slate-600 outline-none focus:border-blue-500/60" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-widest text-slate-500">
              {addType === "SELL" ? "Sell price/share" : addType === "DRIP" ? "Reinvestment price" : "Buy price/share"}
            </label>
            <input name="price_per_share" type="number" step="0.000001" min="0.000001" placeholder="185.50" required
              className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white placeholder-slate-600 outline-none focus:border-blue-500/60" />
          </div>

          <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
            <button type="submit" disabled={isPending}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60 transition ${
                addType === "SELL" ? "bg-red-600 hover:bg-red-500"
                : addType === "DRIP" ? "bg-blue-600 hover:bg-blue-500"
                : "bg-emerald-700 hover:bg-emerald-600"
              }`}>
              {isPending ? "Saving…" : `Save ${addType === "SELL" ? "sell" : addType === "DRIP" ? "dividend" : "buy"}`}
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(""); }}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
