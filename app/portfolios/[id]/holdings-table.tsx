"use client";

import { useState } from "react";
import { EditHoldingForm, DeleteHoldingButton } from "./add-holding-form";

type ValuedHolding = {
  id: string;
  ticker: string;
  company_name: string | null;
  asset_type: string | null;
  shares_number: number;
  average_cost_basis_number: number | null;
  current_price: number | null;
  market_value: number | null;
  unrealized_pl: number | null;
  unrealized_pl_pct: number | null;
  weight_pct: number | null;
  notes?: string | null;
};

type HoldingsTableProps = {
  portfolioId: string;
  holdings: ValuedHolding[];
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export default function HoldingsTable({ portfolioId, holdings }: HoldingsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (holdings.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-white/5 bg-white/2 p-5 text-center">
        <p className="text-sm font-medium text-white">No holdings yet</p>
        <p className="mt-1 text-xs text-slate-500">Add your first position using the button above.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-white/5">
      <table className="min-w-full divide-y divide-white/5">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            <th className="bg-white/3 px-3 py-3">Ticker</th>
            <th className="bg-white/3 px-3 py-3 hidden sm:table-cell">Company</th>
            <th className="bg-white/3 px-3 py-3">Shares</th>
            <th className="bg-white/3 px-3 py-3 hidden md:table-cell">Avg Cost</th>
            <th className="bg-white/3 px-3 py-3 hidden md:table-cell">Price</th>
            <th className="bg-white/3 px-3 py-3">Value</th>
            <th className="bg-white/3 px-3 py-3">P&L</th>
            <th className="bg-white/3 px-3 py-3 hidden lg:table-cell">Weight</th>
            <th className="bg-white/3 px-3 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/4">
          {holdings.map((holding) => (
            <>
              <tr
                key={holding.id}
                className="text-sm transition hover:bg-white/2"
              >
                <td className="px-3 py-3 font-bold text-white">{holding.ticker}</td>
                <td className="px-3 py-3 text-slate-400 hidden sm:table-cell">{holding.company_name || "—"}</td>
                <td className="px-3 py-3 text-slate-300">
                  {holding.shares_number.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                </td>
                <td className="px-3 py-3 text-slate-300 hidden md:table-cell">{formatMoney(holding.average_cost_basis_number)}</td>
                <td className="px-3 py-3 text-slate-300 hidden md:table-cell">{formatMoney(holding.current_price)}</td>
                <td className="px-3 py-3 font-medium text-white">{formatMoney(holding.market_value)}</td>
                <td className={`px-3 py-3 font-medium ${
                  holding.unrealized_pl !== null && holding.unrealized_pl > 0
                    ? "text-emerald-400"
                    : holding.unrealized_pl !== null && holding.unrealized_pl < 0
                    ? "text-red-400"
                    : "text-slate-400"
                }`}>
                  <div>{formatMoney(holding.unrealized_pl)}</div>
                  <div className="text-[10px] opacity-70">{formatPercent(holding.unrealized_pl_pct)}</div>
                </td>
                <td className="px-3 py-3 text-slate-400 hidden lg:table-cell">{formatPercent(holding.weight_pct)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(editingId === holding.id ? null : holding.id)}
                      className="text-xs text-blue-400/60 transition hover:text-blue-400"
                    >
                      {editingId === holding.id ? "Cancel" : "Edit"}
                    </button>
                    <DeleteHoldingButton
                      holdingId={holding.id}
                      portfolioId={portfolioId}
                      ticker={holding.ticker}
                    />
                  </div>
                </td>
              </tr>

              {/* Inline edit row */}
              {editingId === holding.id && (
                <tr key={`edit-${holding.id}`}>
                  <td colSpan={9} className="bg-blue-500/5 px-4 py-4">
                    <EditHoldingForm
                      holding={{
                        id: holding.id,
                        portfolio_id: portfolioId,
                        ticker: holding.ticker,
                        company_name: holding.company_name,
                        asset_type: holding.asset_type,
                        shares: holding.shares_number,
                        average_cost_basis: holding.average_cost_basis_number,
                        notes: holding.notes ?? null,
                      }}
                      onClose={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
