-- Allow unauthenticated (anon) visitors to read public portfolio share pages.
-- The existing policies are TO authenticated only, so share links 404 for
-- users who aren't logged in. These policies grant the anon role the same
-- read access they would get as an authenticated visitor for public rows.
-- Run this in the Supabase SQL editor.

DROP POLICY IF EXISTS "public_portfolios_select_anon" ON public_portfolios;
CREATE POLICY "public_portfolios_select_anon"
  ON public_portfolios FOR SELECT
  TO anon
  USING (is_public = true);

DROP POLICY IF EXISTS "pub_holdings_select_anon" ON public_portfolio_holdings;
CREATE POLICY "pub_holdings_select_anon"
  ON public_portfolio_holdings FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public_portfolios pp
      WHERE pp.id = public_portfolio_id AND pp.is_public = true
    )
  );
