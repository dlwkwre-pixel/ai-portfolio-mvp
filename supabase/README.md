# Supabase SQL migrations

These files are **documentation of schema changes** — they are never executed by the app.
Run them manually in the Supabase dashboard SQL editor.

## Convention

- **`supabase/` (this folder)** — SQL that has **NOT yet been run** against the live database.
  If a file is sitting here, it's on your to-do list.
- **`supabase/applied/`** — SQL that has been verified as applied to the live database.
  After you run a file in the SQL editor, move it: `git mv supabase/<file>.sql supabase/applied/`

## Pending — run these in the SQL editor

Verified missing from the live DB on 2026-07-16 (probed every table/column via the REST API).
Each one backs code that is already shipped:

| File | Unblocks |
|---|---|
| `apartment-setup.sql` | Apartment planner — `apartment_listings` table (saving listings currently fails) |
| `decision-journal-ai-source.sql` | Decision journal ↔ AI recommendation linking (`source`, `recommendation_item_id` columns) |
| `estate-account-access.sql` | Estate tab account-access + family-instructions fields |
| `home-owner-mode.sql` | Homeowner mode on planning profile (10 `owner_*` columns on `financial_profiles`) |
| `market-pulse-setup.sql` | Community market-pulse API — `market_pulse` table |

## Safe to re-run (couldn't machine-verify)

These contain only indexes/policies, which the REST API can't probe. Both are idempotent
(`IF NOT EXISTS` / `DROP POLICY IF EXISTS`) — running them again is harmless, so run them
once more if unsure, then move to `applied/`:

- `recommendation-indexes.sql` — indexes for AI recommendation queries
- `share-page-anon-access.sql` — anon read access for public share pages (if logged-out
  share links work, it's already applied)

## Verification

The 84 files in `applied/` were classified by probing the live database
(`GET /rest/v1/<table>?limit=0` for tables, `?select=<col>&limit=0` for columns) with the
service-role key — not by memory. To re-audit later, ask Claude to re-run the same probe.
