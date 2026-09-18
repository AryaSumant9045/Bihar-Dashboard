-- ============================================================
-- 012_pk_intel.sql
-- ------------------------------------------------------------
-- Stores AI-generated Prashant Kishor / Jan Suraaj intelligence
-- snapshots. The /api/cron/pk-intel pipeline (run every 3 days at
-- night via GitHub Action) writes one row per generation. The PK
-- Tracker page reads the latest row and renders:
--   * activity_log   → 📅 Activity Log timeline
--   * strategy_cards → 🧠 Strategy Cards
--   * movement_map   → 📍 Movement Map markers
--   * social_stats   → 📱 Social Monitor
-- Run this once in the Supabase SQL editor.
-- ============================================================

create table if not exists public.pk_intel (
  id            uuid primary key default gen_random_uuid(),
  generated_at  timestamptz not null default now(),
  activity_log  jsonb not null default '[]'::jsonb,
  strategy_cards jsonb not null default '[]'::jsonb,
  movement_map  jsonb not null default '[]'::jsonb,
  social_stats  jsonb not null default '{}'::jsonb,
  source_count  integer not null default 0,
  ai_provider   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_pk_intel_generated
  on public.pk_intel (generated_at desc);

alter table public.pk_intel enable row level security;

-- Public read (dashboard shows the latest snapshot to everyone)
drop policy if exists "pk_intel_read" on public.pk_intel;
create policy "pk_intel_read" on public.pk_intel
  for select using (true);

-- Only the server-side service role may write snapshots
drop policy if exists "pk_intel_service_write" on public.pk_intel;
create policy "pk_intel_service_write" on public.pk_intel
  for all to service_role using (true) with check (true);
