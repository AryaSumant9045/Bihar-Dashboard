-- ============================================================
-- 011_district_news.sql
-- District-wise latest news store, populated once every 24 hours
-- by the GitHub Action (district-news-daily.yml) via
-- POST/GET /api/cron/district-news.
-- Run this in the Supabase SQL editor.
-- ============================================================

create table if not exists public.district_news (
  id           uuid primary key default gen_random_uuid(),
  district     text not null,
  title        text not null,
  url          text not null,
  source       text,
  image_url    text,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint district_news_url_key unique (url)
);

create index if not exists idx_district_news_district   on public.district_news (district);
create index if not exists idx_district_news_published  on public.district_news (published_at desc);

alter table public.district_news enable row level security;

drop policy if exists "district_news_read" on public.district_news;
create policy "district_news_read"
  on public.district_news for select
  using (true);

drop policy if exists "district_news_service_write" on public.district_news;
create policy "district_news_service_write"
  on public.district_news for all
  to service_role
  using (true) with check (true);
