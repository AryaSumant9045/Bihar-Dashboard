-- ============================================================
-- 017_speech_briefs_extras.sql
-- Speech Intelligence Engine ke naye sections ke liye columns.
-- (Field-ready additions: danger-zone, Q&A prep, local connect,
--  comparison, data freshness.)
-- Supabase SQL editor me ek baar run kar do.
-- ============================================================

alter table public.speech_briefs
  add column if not exists avoid_mentioning            jsonb,
  add column if not exists anticipated_tough_questions jsonb,
  add column if not exists local_connect_points        jsonb,
  add column if not exists comparative_context         text,
  add column if not exists data_freshness              jsonb;

create index if not exists idx_speech_briefs_district_created
  on public.speech_briefs (district, created_at desc);
