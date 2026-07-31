-- Fix: supabase/applied/recommendation-cross-run-memory.sql only granted a SELECT
-- policy on position_thesis_history, so RLS silently blocked every insert from the
-- app's user-scoped Supabase client (applyThesisUpdates() in recommendation-actions.ts).
-- Verified empty table even via service role after multiple real AI runs that should
-- have written rows. Adds the missing INSERT policy, matching the app's changed_by='ai'
-- write pattern (writes always happen server-side on behalf of the portfolio owner).

CREATE POLICY "Users can insert their own position thesis history"
  ON position_thesis_history FOR INSERT
  WITH CHECK (portfolio_id IN (SELECT id FROM portfolios WHERE user_id = auth.uid()));
