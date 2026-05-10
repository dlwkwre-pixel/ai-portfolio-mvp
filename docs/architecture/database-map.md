# BuyTune Database Map

Supabase PostgreSQL schema. All tables use Row Level Security (RLS).
Run migration SQL files in `supabase/` to apply schema changes.

---

## Core Tables

### `portfolios`
The central entity. One portfolio = one brokerage account.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → auth.users | RLS anchor |
| `name` | TEXT | User-defined name |
| `account_type` | TEXT | `brokerage`, `roth_ira`, `traditional_ira`, `paper_trade`, `margin` |
| `description` | TEXT | Optional |
| `benchmark_symbol` | TEXT | Default `SPY` |
| `cash_balance` | NUMERIC | Current uninvested cash |
| `status` | TEXT | `active`, `archived` |
| `is_active` | BOOLEAN | Soft-delete flag |
| `display_order` | INT | User-controlled sort order |
| `last_reconciled_at` | TIMESTAMPTZ | Last "Sync Holdings" audit |
| `last_audit_source` | TEXT | `Robinhood CSV` or `Manual paste` |
| `created_at` | TIMESTAMPTZ | |

### `holdings`
Individual stock/asset positions within a portfolio.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `portfolio_id` | UUID FK → portfolios | Cascade delete |
| `ticker` | TEXT | Uppercase, e.g. `AAPL` |
| `company_name` | TEXT | Optional, set by AI or user |
| `asset_type` | TEXT | `stock`, `etf`, `crypto` |
| `shares` | NUMERIC | Current share count |
| `average_cost_basis` | NUMERIC | Per-share average cost |
| `opened_at` | DATE | Optional position open date |
| `notes` | TEXT | Optional position notes |
| `created_at` | TIMESTAMPTZ | |

### `cash_ledger`
Immutable log of cash movements (deposits, withdrawals, dividends).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `portfolio_id` | UUID FK → portfolios | |
| `amount` | NUMERIC | Absolute value |
| `direction` | TEXT | `IN` or `OUT` |
| `reason` | TEXT | `deposit`, `withdrawal`, `dividend` |
| `effective_at` | TIMESTAMPTZ | When the cash moved |
| `created_at` | TIMESTAMPTZ | |

---

## Portfolio Snapshots & Audit

### `portfolio_snapshots`
Time-series net worth data. Powers the portfolio chart.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `portfolio_id` | UUID FK → portfolios | |
| `snapshot_date` | TIMESTAMPTZ | Throttled: max 1 per 4 hours (page load) |
| `total_value` | NUMERIC | holdings_value + cash_balance |
| `holdings_value` | NUMERIC | Market value of all positions |
| `cash_balance` | NUMERIC | Cash at snapshot time |
| `created_at` | TIMESTAMPTZ | |

### `portfolio_audits`
Immutable log of every "Sync Holdings" reconciliation run.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `portfolio_id` | UUID FK → portfolios | |
| `user_id` | UUID FK → auth.users | |
| `source_type` | TEXT | `robinhood_csv` or `manual_paste` |
| `imported_holdings_json` | JSONB | Full imported holdings list |
| `previous_holdings_json` | JSONB | Full snapshot before any changes (undo support) |
| `applied_changes_json` | JSONB | Log of each change applied |
| `changes_count` | INT | |
| `created_at` | TIMESTAMPTZ | |

---

## Strategies

### `strategies`
User-defined investment strategy profiles.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → auth.users | |
| `name` | TEXT | |
| `description` | TEXT | |
| `style` | TEXT | `growth`, `value`, `income`, `balanced`, `thematic`, `momentum` |
| `risk_level` | TEXT | `conservative`, `moderate`, `aggressive` |
| `is_active` | BOOLEAN | Soft-delete |
| `is_public` | BOOLEAN | Visible on community page |
| `created_at` | TIMESTAMPTZ | |

### `strategy_versions`
Versioned strategy parameters. Strategy assignments reference a specific version.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `strategy_id` | UUID FK → strategies | |
| `version_number` | INT | Increments on edit |
| `prompt_text` | TEXT | Full AI prompt for this strategy |
| `max_position_pct` | NUMERIC | Max allocation per position |
| `min_position_pct` | NUMERIC | Min meaningful position size |
| `cash_min_pct` | NUMERIC | Min cash reserve |
| `cash_max_pct` | NUMERIC | Max cash to hold |
| `turnover_preference` | TEXT | `low`, `medium`, `high` |
| `holding_period_bias` | TEXT | `short_term`, `medium_term`, `long_term` |
| `allow_fractional_shares` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### `portfolio_strategy_assignments`
Links a portfolio to a strategy version. One active assignment at a time.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `portfolio_id` | UUID FK → portfolios | |
| `strategy_id` | UUID FK → strategies | |
| `strategy_version_id` | UUID FK → strategy_versions | |
| `is_active` | BOOLEAN | Only one active per portfolio |
| `assigned_at` | TIMESTAMPTZ | |
| `ended_at` | TIMESTAMPTZ | Null if currently active |

---

## AI Recommendations

### `ai_recommendations`
Individual buy/sell/hold recommendations from a Grok analysis run.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `portfolio_id` | UUID FK → portfolios | |
| `user_id` | UUID FK → auth.users | |
| `run_id` | UUID FK → ai_runs | |
| `ticker` | TEXT | |
| `action_type` | TEXT | `BUY`, `ADD`, `TRIM`, `SELL`, `HOLD`, `WATCH` |
| `thesis` | TEXT | Short thesis (1-2 sentences) |
| `rationale` | TEXT | Full reasoning |
| `conviction` | TEXT | `high`, `medium`, `low` |
| `suggested_allocation_pct` | NUMERIC | Suggested position size |
| `status` | TEXT | `open`, `accepted`, `rejected`, `watching` |
| `created_at` | TIMESTAMPTZ | |

### `ai_runs`
Log of every AI analysis execution.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `portfolio_id` | UUID FK → portfolios | |
| `user_id` | UUID FK → auth.users | |
| `summary` | TEXT | AI-generated portfolio summary |
| `model_used` | TEXT | e.g. `grok-4-fast` |
| `created_at` | TIMESTAMPTZ | |

---

## User Profiles & Social

### `user_profiles`
Extended user data (auth.users is Supabase-managed, this is our app layer).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK = auth.users.id | |
| `username` | TEXT UNIQUE | |
| `display_name` | TEXT | |
| `avatar_color` | TEXT | Hex color for avatar |
| `bio` | TEXT | |
| `is_public` | BOOLEAN | Public profile visibility |
| `onboarding_status` | TEXT | `not_started`, `in_progress`, `completed`, `skipped` |
| `onboarding_step` | INT | Last completed step |
| `onboarding_completed_at` | TIMESTAMPTZ | |
| `onboarding_skipped_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

### `public_portfolios`
Public-facing portfolio cards on the community page.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `source_portfolio_id` | UUID FK → portfolios | |
| `owner_user_id` | UUID FK → auth.users | |
| `public_name` | TEXT | |
| `public_description` | TEXT | |
| `follower_count` | INT | Cached count |
| `copy_count` | INT | Times copied as template |
| `is_public` | BOOLEAN | |
| `last_synced_at` | TIMESTAMPTZ | |

### `follows` / `likes` / `saves`
Social engagement tables. All follow the same pattern:
- `user_id` (actor) + `target_id` (portfolio/strategy/user) + `created_at`

---

## Key SQL Files

| File | Purpose |
|---|---|
| `supabase/portfolio-audit-setup.sql` | `portfolio_audits` table + `portfolios` reconciliation columns |
| *(others to be documented)* | |

---

## RLS Pattern

Every user-owned table has this policy:
```sql
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own [table]"
  ON [table] FOR ALL
  USING (auth.uid() = user_id);
```

Public read is added separately where needed (e.g. community portfolios).
