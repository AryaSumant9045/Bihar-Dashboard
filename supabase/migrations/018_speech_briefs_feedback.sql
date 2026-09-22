-- ============================================================
-- 018_speech_briefs_feedback.sql
-- Speech Intelligence: post-event feedback (learning loop)
-- aur delivery-tone guidance ke liye columns.
-- Supabase SQL editor me ek baar run kar do.
-- ============================================================

alter table public.speech_briefs
  add column if not exists post_event_feedback   jsonb,
  add column if not exists delivery_tone_guidance text,
  add column if not exists media_soundbites      jsonb,
  add column if not exists whats_new_since_last  jsonb;

-- Purani rows me naye sections sync karo (jo base columns me the)
update public.speech_briefs
set media_soundbites = suggested_talking_points
where media_soundbites is null and suggested_talking_points is not null;
