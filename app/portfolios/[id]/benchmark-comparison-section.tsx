import { createClient } from "@/lib/supabase/server";
import { getBenchmarkComparison } from "@/lib/portfolio/benchmark";
import BenchmarkComparisonChart from "./benchmark-comparison-chart";

type BenchmarkComparisonSectionProps = {
  portfolioId: string;
  benchmarkSymbol: string;
};

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";

  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export default async function BenchmarkComparisonSection({
  portfolioId,
  benchmarkSymbol,
}: BenchmarkComparisonSectionProps) {
  const supabase = await createClient();

  const { data: snapshots, error } = await supabase
    .from("portfolio_snapshots")
    .select("snapshot_date, total_value")
    .eq("portfolio_id", portfolioId)
    .order("snapshot_date", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const comparison = await getBenchmarkComparison({
    snapshots: snapshots ?? [],
    benchmarkSymbol: benchmarkSymbol || "SPY",
  });

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Performance vs Benchmark</h2>
          <p className="mt-1 text-sm text-slate-400">
            Snapshot-based return versus {comparison.benchmarkSymbol}.
          </p>
        </div>

        <div className="text-xs text-slate-500">
          {comparison.startDateLabel && comparison.endDateLabel
            ? `${comparison.startDateLabel} → ${comparison.endDateLabel}`
            : "Need more snapshots"}
        </div>
      </div>

      {!comparison.benchmarkAvailable && comparison.hasEnoughSnapshots ? (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          Benchmark history is currently unavailable for {comparison.benchmarkSymbol}.
          Portfolio return is still shown below.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Portfolio Return
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${
              (comparison.portfolioReturnPct ?? 0) >= 0
                ? "text-emerald-300"
                : "text-red-300"
            }`}
          >
            {formatPercent(comparison.portfolioReturnPct)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {comparison.benchmarkSymbol} Return
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${
              (comparison.benchmarkReturnPct ?? 0) >= 0
                ? "text-emerald-300"
                : "text-red-300"
            }`}
          >
            {formatPercent(comparison.benchmarkReturnPct)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Excess Return
          </p>
          <p
            className={`mt-1 text-xl font-semibold ${
              (comparison.excessReturnPct ?? 0) >= 0
                ? "text-emerald-300"
                : "text-red-300"
            }`}
          >
            {formatPercent(comparison.excessReturnPct)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Comparison Period
          </p>
          <p className="mt-1 text-sm font-medium text-white">
            {comparison.startDateLabel && comparison.endDateLabel
              ? `${comparison.startDateLabel} → ${comparison.endDateLabel}`
              : "Need more snapshots"}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <BenchmarkComparisonChart
          data={comparison.chartData}
          benchmarkSymbol={comparison.benchmarkSymbol}
        />
      </div>
    </section>
  );
}