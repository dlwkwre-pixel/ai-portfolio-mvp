-- Interest rates the user enters for balance-sheet accounts: APY on cash/savings, APR on
-- credit cards and loans. Plaid's Transactions product doesn't return rates, so they're
-- typed in once per account. item_ref matches the balance sheet item id: a
-- balance_sheet_items.id for manual items, or "linked:<plaid account_id>" for linked ones.
-- Powers the idle-cash check, interest-cost lines, and "where the leftover should go".

create table if not exists public.account_rates (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_ref text not null,
  rate_pct numeric(6, 3) not null check (rate_pct >= 0 and rate_pct <= 100),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_ref)
);

alter table public.account_rates enable row level security;

drop policy if exists "account_rates_select_own" on public.account_rates;
create policy "account_rates_select_own" on public.account_rates
  for select using (auth.uid() = user_id);

drop policy if exists "account_rates_insert_own" on public.account_rates;
create policy "account_rates_insert_own" on public.account_rates
  for insert with check (auth.uid() = user_id);

drop policy if exists "account_rates_update_own" on public.account_rates;
create policy "account_rates_update_own" on public.account_rates
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "account_rates_delete_own" on public.account_rates;
create policy "account_rates_delete_own" on public.account_rates
  for delete using (auth.uid() = user_id);
