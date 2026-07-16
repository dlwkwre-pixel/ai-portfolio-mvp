-- Tax treatment of assets — the foundation for tax-aware retirement modeling.
-- Splits liquid assets into the three tax buckets every real planner reasons about:
--   taxable      → brokerage, savings (cap-gains / interest taxed as you go)
--   tax_deferred → Traditional 401(k)/IRA (taxed as ordinary income on withdrawal; RMDs apply)
--   tax_free     → Roth 401(k)/IRA, HSA (qualified withdrawals tax-free; no RMDs on Roth IRA)
-- NULL = not applicable (illiquid assets like a home or car). One-time assets/liabilities
-- keep working pre-migration since the column is only written when provided.
alter table public.balance_sheet_items
  add column if not exists tax_treatment text;
