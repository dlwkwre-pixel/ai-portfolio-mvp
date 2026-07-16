# Supabase SQL migrations

These files are **documentation of schema changes** — they are never executed by the app.
Run them manually in the Supabase dashboard SQL editor.

## Convention

- **`supabase/` (this folder)** — SQL that has **NOT yet been run** against the live database.
  If a file is sitting here, it's on your to-do list.
- **`supabase/applied/`** — SQL that has been verified as applied to the live database.
  After you run a file in the SQL editor, move it: `git mv supabase/<file>.sql supabase/applied/`

## Pending — run these in the SQL editor

*Nothing pending. All 91 files applied as of 2026-07-16.*

When a new file lands here, run it in the Supabase SQL editor, then move it to `applied/`.

## Verification

The files in `applied/` were classified by probing the live database
(`GET /rest/v1/<table>?limit=0` for tables, `?select=<col>&limit=0` for columns) with the
service-role key — not by memory. To re-audit later, ask Claude to re-run the same probe.
