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

type DraftRow = {
  holdingId: string;
  ticker: string;
  date: string;
  shares: string;
  price: string;
  hasExistingLots: boolean;
  isEstimated: boolean;
};

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
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
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
            const earliest = buyLots.length > 0
              ? buyLots.reduce((min, l) => (l.purchased_at < min.purchased_at ? l : min))
              : null;

            return {
              holdingId: h.id,
              ticker: h.ticker,
              date: earliest?.purchased_at ?? h.opened_at?.slice(0, 10) ?? "",
              shares: earliest
                ? String(buyLots.reduce((s, l) => s + l.shares, 0))
                : String(h.shares),
              price: earliest
                ? String(earliest.price_per_share)
                : h.average_cost_basis != null ? String(h.average_cost_basis) : "",
              hasExistingLots: buyLots.length > 0,
              isEstimated: buyLots.length === 0,
            };
          })
        );
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load holdings."));
  }, [portfolioId]);

  function update(holdingId: string, field: "date" | "shares" | "price", value: string) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.holdingId === holdingId ? { ...d, [field]: value, isEstimated: false } : d
      )
    );
  }

  function handleBuild() {
    setSaveError("");
    startTransition(async () => {
      try {
        for (const draft of drafts) {
          if (draft.hasExistingLots) continue;
          if (!draft.date || !draft.shares || !draft.price) continue;
          const shares = parseFloat(draft.shares);
          const price = parseFloat(draft.price);
          if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) continue;

          const fd = new FormData();
          fd.set("holding_id", draft.holdingId);
          fd.set("portfolio_id", portfolioId);
          fd.set("ticker", draft.ticker);
          fd.set("purchased_at", draft.date);
          fd.set("shares", String(shares));
          fd.set("price_per_share", String(price));
          fd.set("lot_type", "BUY");
          await createHoldingLot(fd);
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

  const allValid = drafts.every((d) => {
    if (d.hasExistingLots) return true;
    return d.date && d.shares && d.price &&
      parseFloat(d.shares) > 0 && parseFloat(d.price) > 0;
  });

  const missingCount = drafts.filter((d) => !d.hasExistingLots && (!d.date || !d.price)).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col"
        style={{
          background: "var(--bg-card, #0f1a2e)",
          border: "1px solid rgba(255,255,255,0.09)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Set up purchase history</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Confirm when you bought each holding and at what price. BuyTune uses this to calculate accurate returns.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 mt-0.5 flex-shrink-0 text-slate-500 hover:text-slate-300 transition text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 pb-2">
          {!holdings && !loadError && (
            <div className="py-10 text-center text-slate-500 text-sm">Loading your holdings…</div>
          )}

          {loadError && (
            <p className="py-4 text-sm text-red-400">{loadError}</p>
          )}

          {holdings && drafts.length === 0 && (
            <p className="py-4 text-sm text-slate-400">No holdings found in this portfolio.</p>
          )}

          {holdings && drafts.length > 0 && (
            <div className="space-y-2">
              {drafts.map((draft) => {
                const totalCost =
                  parseFloat(draft.shares || "0") * parseFloat(draft.price || "0");

                return (
                  <div
                    key={draft.holdingId}
                    className="rounded-xl p-3"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-white font-mono bg-white/10 px-2 py-0.5 rounded">
                        {draft.ticker}
                      </span>
                      {draft.hasExistingLots ? (
                        <span className="text-[11px] text-emerald-400">✓ Lots already set up</span>
                      ) : draft.date && draft.price ? (
                        <span className="text-[11px] text-amber-400">
                          {draft.isEstimated ? "Estimated — please verify" : "Edited"}
                        </span>
                      ) : (
                        <span className="text-[11px] text-red-400">Fill in purchase info</span>
                      )}
                    </div>

                    {draft.hasExistingLots ? (
                      <p className="text-[11px] text-slate-500">
                        Using your existing purchase lots. To make changes, edit lots from the holding page.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Purchase date</label>
                            <input
                              type="date"
                              value={draft.date}
                              onChange={(e) => update(draft.holdingId, "date", e.target.value)}
                              className="w-full rounded-lg px-2 py-1.5 text-xs text-white"
                              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Shares</label>
                            <input
                              type="number"
                              value={draft.shares}
                              onChange={(e) => update(draft.holdingId, "shares", e.target.value)}
                              className="w-full rounded-lg px-2 py-1.5 text-xs text-white"
                              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                              min="0"
                              step="any"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-1">Price/share ($)</label>
                            <input
                              type="number"
                              value={draft.price}
                              onChange={(e) => update(draft.holdingId, "price", e.target.value)}
                              className="w-full rounded-lg px-2 py-1.5 text-xs text-white"
                              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}
                              min="0"
                              step="any"
                            />
                          </div>
                        </div>
                        {Number.isFinite(totalCost) && totalCost > 0 && (
                          <p className="text-[10px] text-slate-500 mt-1.5">
                            Total: ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {holdings && drafts.length > 0 && (
          <div className="p-5 pt-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            {saveError && <p className="text-xs text-red-400 mb-2">{saveError}</p>}
            {missingCount > 0 && (
              <p className="text-[11px] text-amber-400 mb-2">
                {missingCount} holding{missingCount > 1 ? "s" : ""} still need purchase info — fill in a date and price to include them.
              </p>
            )}
            <button
              type="button"
              onClick={handleBuild}
              disabled={isPending || !allValid}
              className="w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 transition"
              style={{ background: "linear-gradient(135deg, #2563eb, #4f46e5)" }}
            >
              {isPending ? "Building chart…" : "Confirm and build chart"}
            </button>
            <p className="text-[10px] text-slate-600 text-center mt-2">
              If you made multiple purchases (DCA), add the extra lots from each holding's Purchase History tab after building.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
