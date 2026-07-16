-- apartment_listings: user-managed apartment comparison tracker
-- Run this in the Supabase SQL editor.

create table if not exists apartment_listings (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references auth.users(id) on delete cascade,

  -- Property info
  name                       text not null default '',
  website                    text,
  address                    text,
  status                     text not null default 'considering',
    -- 'considering' | 'touring' | 'applied' | 'offer' | 'pass' | 'rejected'

  -- Unit details
  floorplan_name             text,
  bedrooms                   numeric,     -- 0 = Studio
  bathrooms                  numeric,
  square_feet                numeric,
  available_date             date,

  -- Pricing
  base_rent                  numeric not null default 0,
  lease_term_months          integer not null default 12,

  -- Concessions (AI-parsed)
  concession_text            text,
  concession_monthly_savings numeric not null default 0,
  concession_explanation     text,

  -- Fees (one-time, amortized into true monthly)
  application_fee            numeric not null default 0,
  admin_fee                  numeric not null default 0,
  security_deposit           numeric not null default 0,

  -- Pets
  has_pets                   boolean not null default false,
  pet_count                  integer not null default 1,
  pet_deposit                numeric not null default 0,
  pet_rent_monthly           numeric not null default 0,

  -- Extras
  parking_monthly            numeric not null default 0,
  commute_minutes            integer,
  commute_cost_monthly       numeric,

  -- User notes / preferences
  notes                      text,
  user_score                 integer check (user_score between 1 and 5),
  is_favorite                boolean not null default false,

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

-- RLS
alter table apartment_listings enable row level security;

create policy "Users manage their own apartment listings"
  on apartment_listings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists apartment_listings_user_idx on apartment_listings(user_id);
