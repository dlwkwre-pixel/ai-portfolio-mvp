-- Budget versioning for cash flow items
-- Records what the budgeted amount was at each point in time so that
-- historical actuals compare against the budget that was active at the time,
-- not the current (possibly updated) budget.

create table if not exists cash_flow_budget_history (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  item_id         uuid        not null references cash_flow_items(id) on delete cascade,
  amount          numeric(12,2) not null,
  frequency       text        not null default 'monthly' check (frequency in ('monthly','annual')),
  effective_year  int         not null,
  effective_month int         not null check (effective_month between 1 and 12),
  created_at      timestamptz not null default now(),
  -- Only one entry per item per period; later edits in the same month overwrite
  unique (item_id, effective_year, effective_month)
);

create index if not exists cash_flow_budget_history_item_period_idx
  on cash_flow_budget_history (item_id, effective_year, effective_month);

alter table cash_flow_budget_history enable row level security;

create policy "users manage own budget history"
  on cash_flow_budget_history
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
