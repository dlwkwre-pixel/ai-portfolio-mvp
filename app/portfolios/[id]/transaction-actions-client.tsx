"use client";

import { useState } from "react";
import { EditTransactionForm, DeleteTransactionButton } from "./edit-transaction-form";

type Transaction = {
  id: string;
  portfolio_id: string;
  transaction_type: string | null;
  ticker: string | null;
  company_name: string | null;
  quantity: number | null;
  price_per_share: number | null;
  gross_amount: number | null;
  fees: number | null;
  notes: string | null;
  traded_at: string;
};

export default function TransactionActions({ transaction }: { transaction: Transaction }) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="mt-3">
      {editing ? (
        <EditTransactionForm transaction={transaction} onClose={() => setEditing(false)} />
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-blue-400/60 transition hover:text-blue-400"
          >
            Edit
          </button>
          <DeleteTransactionButton
            transactionId={transaction.id}
            portfolioId={transaction.portfolio_id}
            ticker={transaction.ticker}
          />
        </div>
      )}
    </div>
  );
}
