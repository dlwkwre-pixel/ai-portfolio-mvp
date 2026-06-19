-- Community feed: short posts with optional ticker tags, a poll, an attached
-- strategy/portfolio, or a FINN AI take. Likes, comments, poll votes, reports.
-- Counts are computed on read (keeps RLS simple: no cross-user counter writes).

-- ── Posts ────────────────────────────────────────────────────────────────────
create table if not exists public.community_posts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  body                  text not null check (char_length(body) between 1 and 2000),
  tickers               text[] not null default '{}',
  attached_strategy_id  uuid references public.strategies (id) on delete set null,
  attached_portfolio_id uuid references public.public_portfolios (id) on delete set null,
  poll_options          jsonb,   -- e.g. ["Buy","Hold","Trim"] or null
  ai_ticker             text,    -- FINN take ticker (uppercase)
  ai_take               text,    -- FINN take snippet
  is_hidden             boolean not null default false,
  created_at            timestamptz not null default now()
);

create index if not exists community_posts_created_idx on public.community_posts (created_at desc);
create index if not exists community_posts_user_idx on public.community_posts (user_id);
create index if not exists community_posts_tickers_idx on public.community_posts using gin (tickers);

alter table public.community_posts enable row level security;

drop policy if exists "posts_select" on public.community_posts;
create policy "posts_select" on public.community_posts
  for select using (not is_hidden or auth.uid() = user_id);

drop policy if exists "posts_insert_own" on public.community_posts;
create policy "posts_insert_own" on public.community_posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.community_posts;
create policy "posts_update_own" on public.community_posts
  for update using (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.community_posts;
create policy "posts_delete_own" on public.community_posts
  for delete using (auth.uid() = user_id);

-- ── Likes ────────────────────────────────────────────────────────────────────
create table if not exists public.community_post_likes (
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.community_post_likes enable row level security;
drop policy if exists "post_likes_select" on public.community_post_likes;
create policy "post_likes_select" on public.community_post_likes for select using (true);
drop policy if exists "post_likes_insert_own" on public.community_post_likes;
create policy "post_likes_insert_own" on public.community_post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "post_likes_delete_own" on public.community_post_likes;
create policy "post_likes_delete_own" on public.community_post_likes for delete using (auth.uid() = user_id);

-- ── Comments ─────────────────────────────────────────────────────────────────
create table if not exists public.community_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.community_posts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists community_post_comments_post_idx on public.community_post_comments (post_id, created_at);
alter table public.community_post_comments enable row level security;
drop policy if exists "post_comments_select" on public.community_post_comments;
create policy "post_comments_select" on public.community_post_comments for select using (true);
drop policy if exists "post_comments_insert_own" on public.community_post_comments;
create policy "post_comments_insert_own" on public.community_post_comments for insert with check (auth.uid() = user_id);
drop policy if exists "post_comments_delete_own" on public.community_post_comments;
create policy "post_comments_delete_own" on public.community_post_comments for delete using (auth.uid() = user_id);

-- ── Poll votes ───────────────────────────────────────────────────────────────
create table if not exists public.community_poll_votes (
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  option_idx  smallint not null,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.community_poll_votes enable row level security;
drop policy if exists "poll_votes_select" on public.community_poll_votes;
create policy "poll_votes_select" on public.community_poll_votes for select using (true);
drop policy if exists "poll_votes_upsert_own" on public.community_poll_votes;
create policy "poll_votes_upsert_own" on public.community_poll_votes for insert with check (auth.uid() = user_id);
drop policy if exists "poll_votes_update_own" on public.community_poll_votes;
create policy "poll_votes_update_own" on public.community_poll_votes for update using (auth.uid() = user_id);

-- ── Reports (admin reads via service role) ──────────────────────────────────
create table if not exists public.community_post_reports (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.community_posts (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);
alter table public.community_post_reports enable row level security;
drop policy if exists "post_reports_insert_own" on public.community_post_reports;
create policy "post_reports_insert_own" on public.community_post_reports for insert with check (auth.uid() = reporter_id);
drop policy if exists "post_reports_select_own" on public.community_post_reports;
create policy "post_reports_select_own" on public.community_post_reports for select using (auth.uid() = reporter_id);
