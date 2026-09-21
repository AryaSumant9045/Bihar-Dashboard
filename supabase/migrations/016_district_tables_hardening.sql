-- ============================================================
-- 016_district_tables_hardening.sql
-- ------------------------------------------------------------
-- District-table hardening + missing Darbhanga tables.
-- Supabase SQL editor me ye poora script ek baar run kar do.
--
-- 1. district_news_darbhanga / district_summary_darbhanga banao
--    (baaki 37 districts ke tables pehle se hain, in dono ka pair
--     missing tha — isliye Darbhanga ka data kahin nahi ja raha tha)
-- 2. Har district_news_* table par url UNIQUE index lagao, taki
--    duplicate news dobara insert na ho (abhi ye constraint nahi hai)
--
-- NOTE: DDL block ki list database ke current tables se match karti hai.
-- ============================================================

-- ── 1. Darbhanga pair ────────────────────────────────────────
create table if not exists public.district_news_darbhanga (
  id           uuid primary key default gen_random_uuid(),
  heading      text not null,
  url          text not null,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_district_news_darbhanga_published on public.district_news_darbhanga (published_at desc);
alter table public.district_news_darbhanga enable row level security;
drop policy if exists district_news_darbhanga_read on public.district_news_darbhanga;
create policy district_news_darbhanga_read on public.district_news_darbhanga for select using (true);
drop policy if exists district_news_darbhanga_write on public.district_news_darbhanga;
create policy district_news_darbhanga_write on public.district_news_darbhanga for all to service_role using (true) with check (true);

create table if not exists public.district_summary_darbhanga (
  id                  uuid primary key default gen_random_uuid(),
  overall_situation   text,
  key_developments    jsonb,
  political_risks     jsonb,
  bjp_activity        jsonb,
  opposition_activity jsonb,
  news_count          integer,
  created_at          timestamptz not null default now()
);
create index if not exists idx_district_summary_darbhanga_created on public.district_summary_darbhanga (created_at desc);
alter table public.district_summary_darbhanga enable row level security;
drop policy if exists district_summary_darbhanga_read on public.district_summary_darbhanga;
create policy district_summary_darbhanga_read on public.district_summary_darbhanga for select using (true);
drop policy if exists district_summary_darbhanga_write on public.district_summary_darbhanga;
create policy district_summary_darbhanga_write on public.district_summary_darbhanga for all to service_role using (true) with check (true);

-- ── 2. UNIQUE(url) on every district_news_* table ────────────
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'district_news_%'
  loop
    -- RLS + read/write policies (idempotent)
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_write', t);

    -- unique url index (constraint nahi, index — code dono ke saath chalta hai)
    execute format('create unique index if not exists %I on public.%I (url)', 'ux_' || t || '_url', t);
    execute format('create index if not exists %I on public.%I (published_at desc)', 'idx_' || t || '_published', t);
  end loop;
end $$;

-- ── 3. district_summary_* : RLS policies (idempotent) ────────
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename like 'district_summary_%'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_write', t);
    execute format('create index if not exists %I on public.%I (created_at desc)', 'idx_' || t || '_created', t);
  end loop;
end $$;
