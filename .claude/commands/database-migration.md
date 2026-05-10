---
name: database-migration
description: Supabase schema migration workflow for BuyTune — new tables, columns, RLS policies.
allowed_tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob"]
---

# /database-migration

Use this workflow when making schema changes: new tables, added columns, new RLS policies, or index changes.

## Workflow

1. **Write the SQL** — create a new file in `supabase/[feature]-setup.sql`.
2. **Include all of:** CREATE TABLE, indexes, RLS enable, DROP POLICY IF EXISTS + CREATE POLICY.
3. **Update TypeScript types** if using generated types (check `lib/supabase/` for type files).
4. **Update the relevant server action** to use the new columns/table.
5. **Run in Supabase** — paste the SQL into the Supabase SQL editor in the dashboard.
6. **Verify** — confirm the table/columns exist before shipping code that depends on them.

## SQL Template

```sql
-- [Feature] setup
-- Run in Supabase SQL editor.

-- 1. Schema changes
ALTER TABLE [table]
  ADD COLUMN IF NOT EXISTS [column] [TYPE];

-- OR new table:
CREATE TABLE IF NOT EXISTS [table] (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID       REFERENCES portfolios(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS [table]_[column]_idx ON [table] ([column]);

-- 3. RLS
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own [table]" ON [table];
CREATE POLICY "Users manage own [table]"
  ON [table] FOR ALL
  USING (auth.uid() = user_id);
```

## Naming Conventions

- Snake_case for all table and column names
- `_at` suffix for timestamps (`created_at`, `updated_at`, `completed_at`)
- `_id` suffix for foreign keys
- `_json` suffix for JSONB columns
- `is_` prefix for boolean flags (`is_active`, `is_public`)
- `_count` suffix for cached counters

## Common Patterns in BuyTune

- Every user-owned table has `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- Every portfolio-scoped table has `portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE`
- RLS policy always: `USING (auth.uid() = user_id)` — never skip this
- Use `gen_random_uuid()` for PKs, never serial integers

## SQL File Location

`supabase/[feature]-setup.sql` — checked into the repo so the schema is documented.
