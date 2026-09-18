-- Add thumbnail column to the X (Twitter) social tables.
-- Run in Supabase SQL editor if migrations are not applied via CLI.
alter table public.xjansuraaj   add column if not exists image_url text;
alter table public.xinc         add column if not exists image_url text;
alter table public.xrahulgandi  add column if not exists image_url text;
alter table public.xrjd         add column if not exists image_url text;
alter table public.xtejwaniyd   add column if not exists image_url text;
