-- ============================================================
-- 013_district_news_keyword_search.sql
-- Add indexes and views for fast keyword-based district news search
-- Supports searching by title containing district names or keywords
-- ============================================================

/* Create a gin index on title for text search */
create index if not exists idx_district_news_title_gin 
    on public.district_news using gin(to_tsvector('simple', title));

/* Create an index on combined (district, title) for filtered searches */
create index if not exists idx_district_news_district_title 
    on public.district_news (district, lower(title));

/* View for all-district category-wise queries */
drop view if exists v_district_news_all;
create view v_district_news_all as
select 
    id,
    district,
    lower(district) as district_lower,
    to_tsvector('hindienglish', coalesce(title,'')) || to_tsvector('english', coalesce(title,'')) as search_vector,
    title,
    url,
    source,
    image_url,
    published_at,
    created_at
from public.district_news;

comment on table public.v_district_news_all is 'Full-text search enabled district news';
