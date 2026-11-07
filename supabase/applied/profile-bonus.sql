-- Annual bonus on the financial profile (Planning → Overview → Bonus).
-- Run once in the Supabase SQL editor, then move this file to supabase/applied/.
--
--   bonus_pct            % of gross annual salary (20 = 20%)
--   bonus_month          payout month, 1-12 (12 = December)
--   bonus_start          first payout month it applies to (YYYY-MM-01); earlier years had no bonus
--   bonus_includes_401k  whether the 401(k) contribution % also comes out of the bonus
--
-- Cash Flow expects the bonus, after tax, only in its payout month.

ALTER TABLE financial_profiles
  ADD COLUMN IF NOT EXISTS bonus_pct           NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_month         SMALLINT CHECK (bonus_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS bonus_start         DATE,
  ADD COLUMN IF NOT EXISTS bonus_includes_401k BOOLEAN DEFAULT true;
