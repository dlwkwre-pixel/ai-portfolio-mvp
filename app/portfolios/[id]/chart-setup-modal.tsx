"use client";

import { useState, useEffect, useTransition } from "react";
import { getHoldingsForChartSetup, createHoldingLot, reconstructPortfolioChart } from "./actions";

type HoldingData = {
  id: string;
  ticker: string;
  shares: number;
  average_cost_basis: number | null;
  opened_at: string | null;
  lots: { id: string; lot_type: string; purchased_at: string; shares: number; price_per_share: number }[];
};

type LotRow = { key: string; date: string; shares: string; price: string };

type DraftHolding = {
  holdingId: string;
  ticker: string;
  hasExistingLots: boolean;
  lots: LotRow[];
};

let keyCounter = 0;
function newKey() { return String(++keyCounter); }

function makeLot(date = "", shares = "", price = ""): LotRow {
  return { key: newKey(), date, shares, price };
}

export default function ChartSetupModal({
  portfolioId,
  onClose,
  onDone,
}: {
  portfolioId: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [holdings, setHoldings] = useState<HoldingData[] | null>(null);
  const [drafts, setDrafts] = useState<DraftHolding[]>([]);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getHoldingsForChartSetup(portfolioId)
      .then((data) => {
        setHoldings(data);
        setDrafts(
          data.map((h) => {
            const buyLots = h.lots.filter((l) => l.lot_type === "BUY" || l.lot_type === "DRIP");
            if (buyLots.length > 0) {
              return { holdingId: h.id, ticker: h.ticker, hasExistingLots: true, lots: [] };
            }
            // Pre-fill one lot from cost basis + opened_at if available
            const prefillDate = h.opened_at?.slice(0, 10) ?? "";
            const prefillShares = String(h.shares);
            const prefillPrice = h.average_cost_basis != null ? String(h.average_cost_basis) : "";
            return {
              holdingId: h.id,
              ticker: h.ticker,
              hasExistingLots: false,
              lots: [makeLot(prefillDate, prefillShares, prefillPrice)],
            };
          })
        );
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load holdings."));
  }, [portfolioId]);

  function updateLot(holdingId: string, key: string, field: keyof Omit<LotRow, "key">, value: string) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.holdingId !== holdingId ? d : {
          ...d,
          lots: d.lots.map((l) => l.key === key ? { ...l, [field]: value } : l),
        }
      )
    );
  }

  function addLot(holdingId: string) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.holdingId !== holdingId ? d : { ...d, lots: [...d.lots, makeLot()] }
      )
    );
  }

  function removeLot(holdingId: string, key: string) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.holdingId !== holdingId) return d;
        const remaining = d.lots.filter((l) => l.key !== key);
        return { ...d, lots: remaining.length > 0 ? remaining : [makeLot()] };
      })
    );
  }

  function handleBuild() {
    setSaveError("");
    startTransition(async () => {
      try {
        for (const draft of drafts) {
          if (draft.hasExistingLots) continue;
          for (const lot of draft.lots) {
            const shares = parseFloat(lot.shares);
            const price = parseFloat(lot.price);
            if (!lot.date || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) continue;
            const fd = new FormData();
            fd.set("holding_id", draft.holdingId);
            fd.set("portfolio_id", portfolioId);
            fd.set("ticker", draft.ticker);
            fd.set("purchased_at", lot.date);
            fd.set("shares", String(shares));
            fd.set("price_per_share", String(price));
            fd.set("lot_type", "BUY");
            await createHoldingLot(fd);
          }
        }

        const result = await reconstructPortfolioChart(portfolioId);
        if (result.success) {
          onDone(`Chart rebuilt with ${result.inserted} data points across ${result.tickers.length} holdings.`);
        } else {
          setSaveError(result.error);
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Build failed.");
      }
    });
  }

  // Any holding without existing lots must have at least one valid lot row
  const allValid = drafts.every((d) => {
    if (d.hasExistingLots) return true;
    return d.lots.some((l) => {
      const s = parseFloat(l.shares);
      const p = parseFloat(l.price);
      return l.date && Number.isFinite(s) && s > 0 && Number.isFinite(p) && p > 0;
    });
  });

  const needsSetupCount = drafts.filter((d) => !d.hasExistingLots).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col"
        style={{ background: "var(--bg-card, #0f1a2e)", border: "1px solid var(--line-008)", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Set up purchase history</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter when and at what price you bought each holding. Add multiple lots for DCA purchases.
            </p>
          </div>
          <button onClick={onClose} className="ml-3 mt-0.5 flex-shrink-0 text-slate-500 hover:text-slate-300 transition text-lg leading-none"><span aria-hidden="true">✕</span><span className="bt-sr-only">Close</span></button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 pb-2">
          {!holdings && !loadError && (
            <div className="py-10 text-center text-slate-500 text-sm">Loading your holdings…</div>
          )}
          {loadError && <p className="py-4 text-sm text-red-400">{loadError}</p>}
          {holdings && drafts.length === 0 && (
            <p className="py-4 text-sm text-slate-400">No holdings found in this portfolio.</p>
          )}

          {holdings && drafts.length > 0 && (
            <div className="space-y-3">
              {drafts.map((draft) => {
                if (draft.hasExistingLots) {
                  return (
                    <div key={draft.holdingId} className="rounded-xl p-3 flex items-center gap-3"
                      style={{ background: "var(--surface-003)", border: "1px solid var(--line-006)" }}>
                      <span className="text-xs font-bold text-white font-mono bg-white/10 px-2 py-0.5 rounded">{draft.ticker}</span>
                      <span className="text-[11px] text-emerald-400">✓ Lots already set up</span>
                    </div>
                  );
                }

                return (
                  <div key={draft.holdingId} className="rounded-xl p-3"
                    style={{ background: "var(--surface-004)", border: "1px solid var(--line-008)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-bold text-white font-mono bg-white/10 px-2 py-0.5 rounded">{draft.ticker}</span>
                      <span className="text-[10px] text-slate-500">
                        {draft.lots.length === 1 ? "1 purchase" : `${draft.lots.length} purchases`}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {draft.lots.map((lot, idx) => {
                        const totalCost = parseFloat(lot.shares || "0") * parseFloat(lot.price || "0");
                        return (
                          <div key={lot.key} className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>
                            <div>
                              {idx === 0 && <label className="block text-[10px] text-slate-500 mb-1">Date</label>}
                              <input
                                type="date"
                                value={lot.date}
                                onChange={(e) => updateLot(draft.holdingId, lot.key, "date", e.target.value)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs text-white"
                                style={{ background: "var(--surface-008)", border: "1px solid var(--line-012)" }}
                              />
                            </div>
                            <div>
                              {idx === 0 && <label className="block text-[10px] text-slate-500 mb-1">Shares</label>}
                              <input
                                type="number"
                                value={lot.shares}
                                placeholder="0"
                                onChange={(e) => updateLot(draft.holdingId, lot.key, "shares", e.target.value)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs text-white"
                                style={{ background: "var(--surface-008)", border: "1px solid var(--line-012)" }}
                                min="0" step="any"
                              />
                            </div>
                            <div>
                              {idx === 0 && <label className="block text-[10px] text-slate-500 mb-1">Price/share</label>}
                              <input
                                type="number"
                                value={lot.price}
                                placeholder="$0.00"
                                onChange={(e) => updateLot(draft.holdingId, lot.key, "price", e.target.value)}
                                className="w-full rounded-lg px-2 py-1.5 text-xs text-white"
                                style={{ background: "var(--surface-008)", border: "1px solid var(--line-012)" }}
                                min="0" step="any"
                              />
                            </div>
                            <div className="flex flex-col justify-end">
                              {idx === 0 && <div className="mb-1" style={{ height: 16 }} />}
                              {draft.lots.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => removeLot(draft.holdingId, lot.key)}
                                  className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:text-red-400 transition"
                                  style={{ background: "var(--surface-005)", border: "1px solid var(--line-008)" }}
                                  title="Remove lot"
                                ><span aria-hidden="true">✕</span><span className="bt-sr-only">Remove</span></button>
                              ) : (
                                <div className="rounded-lg px-2 py-1.5" style={{ background: "transparent" }} />
                              )}
                            </div>
                            {Number.isFinite(totalCost) && totalCost > 0 && (
                              <p className="col-span-4 text-[10px] text-slate-600 -mt-1">
                                = ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => addLot(draft.holdingId)}
                      className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 transition"
                    >
                      + Add another lot
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {holdings && drafts.length > 0 && (
          <div className="p-5 pt-3 flex-shrink-0" style={{ borderTop: "1px solid var(--line-007)" }}>
            {saveError && <p className="text-xs text-red-400 mb-2">{saveError}</p>}
            {needsSetupCount > 0 && (
              <p className="text-[11px] text-slate-500 mb-2">
                {needsSetupCount} holding{needsSetupCount !== 1 ? "s" : ""} to set up.
                Each needs at least one complete lot (date, shares, price).
              </p>
            )}
            <button
              type="button"
              onClick={handleBuild}
              disabled={isPending || !allValid}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition"
              style={{ background: "var(--brand-gradient)" }}
            >
              {isPending ? "Building chart…" : "Confirm and build chart"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
