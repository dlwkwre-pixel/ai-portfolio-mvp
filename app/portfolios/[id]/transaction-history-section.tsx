import { createClient } from "@/lib/supabase/server";
import AddTransactionForm from "./add-transaction-form";

type TransactionHistorySectionProps = {
  portfolioId: string;
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatTransactionType(value: string | null) {
  if (!value) return "—";
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function txTypeBadge(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "buy") return "bg-blue-500/15 text-blue-300 border-blue-500/20";
  if (t === "sell") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
  if (t === "dividend") return "bg-purple-500/15 text-purple-300 border-purple-500/20";
  return "bg-white/5 text-slate-300 border-white/10";
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

  if (transactionsError) throw new Error(transactionsError.message);

  return (
    <section className="card rounded-2xl p-5" style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Transaction Ledger</h2>
          <p className="mt-0.5 text-sm text-slate-500">Record and review all trades and cash events.</p>
        </div>
        <span className="text-xs text-slate-600">{transactions?.length ?? 0} recent</span>
      </div>

      <div className="mt-4">
        <AddTransactionForm portfolioId={portfolioId} />
      </div>

      {transactions && transactions.length > 0 ? (
        <div className="mt-4 space-y-2">
          {transactions.map((tx) => {
            const isPositive = Number(tx.net_cash_impact) >= 0;
            const isSell = tx.transaction_type === "sell";
            const realizedValue = Number(tx.realized_gain_loss ?? 0);
            const realizedPositive = realizedValue >= 0;

            return (
              <details
                key={tx.id}
                className="group rounded-xl border border-white/5 bg-white/2 px-4 py-3 transition hover:bg-white/4"
              >
                <summary className="flex cursor-pointer list-none flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${txTypeBadge(tx.transaction_type)}`}>
                      {formatTransactionType(tx.transaction_type)}
                    </span>
                    {tx.ticker && <span className="text-sm font-bold text-white">{tx.ticker}</span>}
                    {tx.company_name && <span className="truncate text-xs text-slate-500">{tx.company_name}</span>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-600">{new Date(tx.traded_at).toLocaleDateString()}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                      {isPositive ? "+" : ""}{formatMoney(tx.net_cash_impact)}
                    </span>
                    <span className="text-[10px] text-slate-600 group-open:hidden">▼</span>
                    <span className="hidden text-[10px] text-slate-600 group-open:inline">▲</span>
                  </div>
                </summary>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Quantity", value: tx.quantity ?? "—" },
                    { label: "Price / Share", value: formatMoney(tx.price_per_share) },
                    { label: "Gross Amount", value: formatMoney(tx.gross_amount) },
                    { label: "Fees", value: formatMoney(tx.fees) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/5 bg-white/3 px-3 py-3">
                      <p className="text-[10px] uppercase tracking-widest text-slate-500">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>

                {isSell && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {[
                      { label: "Cost Basis Sold", value: formatMoney(tx.cost_basis_amount), tone: "neutral" },
                      { label: "Realized P/L", value: formatMoney(tx.realized_gain_loss), tone: realizedPositive ? "positive" : "negative" },
                      { label: "Realized P/L %", value: formatPercent(tx.realized_gain_loss_pct), tone: realizedPositive ? "positive" : "negative" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-white/5 bg-white/3 px-3 py-3">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">{item.label}</p>
                        <p className={`mt-1 text-sm font-semibold ${item.tone === "positive" ? "text-emerald-400" : item.tone === "negative" ? "text-red-400" : "text-white"}`}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {tx.notes && (
                  <div className="mt-2 rounded-xl border border-white/5 bg-white/3 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Notes</p>
                    <p className="mt-1 text-sm text-slate-300">{tx.notes}</p>
                  </div>
                )}

                <p className="mt-2 text-xs text-slate-600">{new Date(tx.traded_at).toLocaleString()}</p>
              </details>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-white/5 bg-white/2 p-5">
          <p className="text-sm text-slate-500">No transactions yet. Add a trade or cash event to begin building the ledger.</p>
        </div>
      )}
    </section>
  );
}
