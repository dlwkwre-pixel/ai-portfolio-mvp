import { createClient } from "@/lib/supabase/server";
import AddTransactionForm from "./add-transaction-form";

type TransactionHistorySectionProps = {
  portfolioId: string;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return `$${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatTransactionType(value: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function TransactionHistorySection({
  portfolioId,
}: TransactionHistorySectionProps) {
  const supabase = await createClient();

  const { data: transactions, error: transactionsError } = await supabase
    .from("portfolio_transactions")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("traded_at", { ascending: false })
    .limit(20);

  if (transactionsError) {
    throw new Error(transactionsError.message);
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Transaction Ledger</h2>
          <p className="mt-1 text-sm text-slate-400">
            Record trades and cash events without clutter.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          {transactions?.length ?? 0} recent transaction
          {(transactions?.length ?? 0) === 1 ? "" : "s"}
        </div>
      </div>

      <div className="mt-4">
        <AddTransactionForm portfolioId={portfolioId} />
      </div>

      {transactions && transactions.length > 0 ? (
        <div className="mt-4 space-y-3">
          {transactions.map((transaction) => {
            const isPositive = Number(transaction.net_cash_impact) >= 0;
            const isSell = transaction.transaction_type === "sell";
            const realizedValue = Number(transaction.realized_gain_loss ?? 0);
            const realizedPositive = realizedValue >= 0;

            return (
              <details
                key={transaction.id}
                className="group rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <summary className="flex cursor-pointer list-none flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                      {formatTransactionType(transaction.transaction_type)}
                    </span>

                    {transaction.ticker ? (
                      <span className="text-base font-semibold text-white">
                        {transaction.ticker}
                      </span>
                    ) : null}

                    {transaction.company_name ? (
                      <span className="truncate text-sm text-slate-400">
                        {transaction.company_name}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs text-slate-500">
                      {new Date(transaction.traded_at).toLocaleDateString()}
                    </span>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        isPositive
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-red-500/10 text-red-300"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {formatMoney(transaction.net_cash_impact)}
                    </span>

                    <span className="text-xs text-slate-500 group-open:hidden">
                      Expand
                    </span>
                    <span className="hidden text-xs text-slate-500 group-open:inline">
                      Collapse
                    </span>
                  </div>
                </summary>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Quantity
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {transaction.quantity ?? "—"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Price / Share
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatMoney(transaction.price_per_share)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Gross Amount
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatMoney(transaction.gross_amount)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Fees
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {formatMoney(transaction.fees)}
                    </p>
                  </div>
                </div>

                {isSell ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">
                        Cost Basis Sold
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">
                        {formatMoney(transaction.cost_basis_amount)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">
                        Realized P/L
                      </p>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          realizedPositive ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {formatMoney(transaction.realized_gain_loss)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">
                        Realized P/L %
                      </p>
                      <p
                        className={`mt-1 text-sm font-semibold ${
                          realizedPositive ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {formatPercent(transaction.realized_gain_loss_pct)}
                      </p>
                    </div>
                  </div>
                ) : null}

                {transaction.notes ? (
                  <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Notes
                    </p>
                    <p className="mt-1 text-sm text-slate-300">
                      {transaction.notes}
                    </p>
                  </div>
                ) : null}

                <div className="mt-3 text-xs text-slate-500">
                  {new Date(transaction.traded_at).toLocaleString()}
                </div>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <p className="text-sm text-slate-400">
            No transactions yet. Add a trade or cash event to begin building the
            ledger.
          </p>
        </div>
      )}
    </section>
  );
}