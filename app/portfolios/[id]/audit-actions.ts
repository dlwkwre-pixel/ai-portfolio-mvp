"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type ChangeToApply = {
  ticker: string;
  action: "add" | "remove" | "change";
  importedShares: number;
};

type ApplyParams = {
  portfolioId: string;
  sourceType: "robinhood_csv" | "manual_paste";
  importedHoldings: Array<{ ticker: string; shares: number }>;
  changesToApply: ChangeToApply[];
};

type ApplyResult =
  | { success: true; changesApplied: number }
  | { success: false; error: string; changesApplied: 0 };

export async function applyPortfolioAudit(params: ApplyParams): Promise<ApplyResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "You must be signed in.", changesApplied: 0 };

    const { portfolioId, sourceType, importedHoldings, changesToApply } = params;
    if (!portfolioId) return { success: false, error: "Portfolio ID required.", changesApplied: 0 };
    if (!changesToApply.length) return { success: false, error: "No changes to apply.", changesApplied: 0 };

    // Verify ownership
    const { data: portfolio, error: portfolioErr } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", portfolioId)
      .eq("user_id", user.id)
      .single();
    if (portfolioErr || !portfolio) return { success: false, error: "Portfolio not found.", changesApplied: 0 };

    // Capture full holdings snapshot BEFORE any changes (enables future undo)
    const { data: currentHoldings } = await supabase
      .from("holdings")
      .select("id, ticker, company_name, asset_type, shares, average_cost_basis, opened_at, notes")
      .eq("portfolio_id", portfolioId);

    const previousHoldingsJson = {
      captured_at: new Date().toISOString(),
      holdings: (currentHoldings ?? []).map((h) => ({
        id: h.id,
        ticker: h.ticker,
        company_name: h.company_name,
        asset_type: h.asset_type,
        shares: Number(h.shares),
        average_cost_basis: Number(h.average_cost_basis),
        opened_at: h.opened_at ?? null,
        notes: h.notes ?? null,
      })),
    };

    // Apply each selected change
    let changesApplied = 0;
    const appliedLog: Array<{
      ticker: string;
      action: string;
      previousShares: number | null;
      newShares: number;
    }> = [];

    for (const change of changesToApply) {
      const ticker = change.ticker.toUpperCase();

      if (change.action === "add") {
        const { error } = await supabase.from("holdings").insert({
          portfolio_id: portfolioId,
          ticker,
          company_name: null,
          asset_type: "stock",
          shares: change.importedShares,
          average_cost_basis: 0,
        });
        if (!error) {
          changesApplied++;
          appliedLog.push({ ticker, action: "add", previousShares: null, newShares: change.importedShares });
        }
      } else if (change.action === "remove") {
        const { data: existing } = await supabase
          .from("holdings")
          .select("id, shares")
          .eq("portfolio_id", portfolioId)
          .eq("ticker", ticker)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from("holdings")
            .delete()
            .eq("id", existing.id)
            .eq("portfolio_id", portfolioId);
          if (!error) {
            changesApplied++;
            appliedLog.push({ ticker, action: "remove", previousShares: Number(existing.shares), newShares: 0 });
          }
        }
      } else if (change.action === "change") {
        const { data: existing } = await supabase
          .from("holdings")
          .select("id, shares")
          .eq("portfolio_id", portfolioId)
          .eq("ticker", ticker)
          .maybeSingle();
        if (existing) {
          const { error } = await supabase
            .from("holdings")
            .update({ shares: change.importedShares })
            .eq("id", existing.id)
            .eq("portfolio_id", portfolioId);
          if (!error) {
            changesApplied++;
            appliedLog.push({
              ticker,
              action: "change",
              previousShares: Number(existing.shares),
              newShares: change.importedShares,
            });
          }
        }
      }
    }

    // Log the audit with full backup
    await supabase.from("portfolio_audits").insert({
      portfolio_id: portfolioId,
      user_id: user.id,
      source_type: sourceType,
      imported_holdings_json: importedHoldings,
      previous_holdings_json: previousHoldingsJson,
      applied_changes_json: { changes: appliedLog },
      changes_count: changesApplied,
    });

    // Update reconciliation metadata on the portfolio
    const sourceLabel = sourceType === "robinhood_csv" ? "Robinhood CSV" : "Manual paste";
    await supabase
      .from("portfolios")
      .update({
        last_reconciled_at: new Date().toISOString(),
        last_audit_source: sourceLabel,
      })
      .eq("id", portfolioId)
      .eq("user_id", user.id);

    revalidatePath(`/portfolios/${portfolioId}`);

    return { success: true, changesApplied };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unexpected error. Your holdings are unchanged.",
      changesApplied: 0,
    };
  }
}
