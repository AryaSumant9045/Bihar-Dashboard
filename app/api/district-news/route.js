/**
 * app/api/district-news/route.js
 * --------------------------------------------------------
 * Reader for the per-district news tables (district_news_<slug>),
 * populated by /api/cron/district-news.
 *
 * GET /api/district-news?district=Patna&limit=5&offset=0
 * GET /api/district-news?district=all            → mixed latest from every district
 * GET /api/district-news?district=bihar          → state-level rows (shared district_news)
 * GET /api/district-news?district=Ara&keyword=flood
 *
 * Accepts feed labels (Ara, Chapra, Biharsharif…), slugs (bhojpur, saran),
 * English and Hindi names — everything resolves through lib/districts.js.
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import { DISTRICT_SLUGS, districtNewsTable, resolveDistrict, districtLabel } from '../../../lib/districts.js';

const STATE_TABLE = 'district_news';

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

/** Normalise a per-district row (heading) into the UI shape (title). */
function toItem(row, districtName) {
  return {
    id: row.id,
    title: row.heading || row.title || '',
    url: row.url,
    source: row.source || 'Live Hindustan',
    district: row.district || districtName,
    published_at: row.published_at,
    created_at: row.created_at,
  };
}

function isMissingTable(error) {
  return /42P01|PGRST205|Could not find the table|does not exist/i.test(`${error?.code || ''} ${error?.message || ''}`);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const districtInput = searchParams.get('district') || 'all';
  const keyword = (searchParams.get('keyword') || '').trim();
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 5, 1), 100);
  const offset = Math.max(parseInt(searchParams.get('offset'), 10) || 0, 0);

  const supabase = makeSupabase();
  if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    const entry = resolveDistrict(districtInput);
    const key = districtInput.trim().toLowerCase();
    const isState = ['bihar', 'state', 'bihar (state level)', 'bihar (राज्य स्तर)'].includes(key);

    /* ── Single district → its own table ───────────────────────── */
    if (entry) {
      const table = districtNewsTable(entry.slug);
      let query = supabase
        .from(table)
        .select('*', { count: 'exact' })
        .order('published_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (keyword) query = query.ilike('heading', `%${keyword}%`);

      const { data, error, count } = await query;
      if (error) {
        if (isMissingTable(error)) {
          return Response.json({
            district: entry.en, table, items: [], total: 0, offset, limit,
            message: `Table ${table} is not created yet. Run the district migration in Supabase.`,
          });
        }
        return Response.json({ error: error.message }, { status: 500 });
      }
      return Response.json({
        district: entry.en,
        table,
        items: (data || []).map((r) => toItem(r, entry.en)),
        total: count ?? (data || []).length,
        offset,
        limit,
      });
    }

    /* ── State-level → shared district_news table ──────────────── */
    if (isState) {
      let query = supabase
        .from(STATE_TABLE)
        .select('*', { count: 'exact' })
        .eq('district', 'Bihar')
        .order('published_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (keyword) query = query.ilike('title', `%${keyword}%`);
      const { data, error, count } = await query;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({
        district: 'Bihar',
        items: (data || []).map((r) => toItem(r, 'Bihar')),
        total: count ?? (data || []).length,
        offset,
        limit,
      });
    }

    /* ── "all" → mixed latest across every district table ──────── */
    const perTable = Math.min(offset + limit, 100);
    const results = await Promise.allSettled(
      DISTRICT_SLUGS.map(async (slug) => {
        const table = districtNewsTable(slug);
        let query = supabase
          .from(table)
          .select('*')
          .order('published_at', { ascending: false })
          .limit(perTable);
        if (keyword) query = query.ilike('heading', `%${keyword}%`);
        const { data, error } = await query;
        if (error) throw error;
        const label = districtLabel(slug);
        return (data || []).map((r) => ({ row: r, label }));
      })
    );

    const merged = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const seen = new Set();
    const items = merged
      .sort((a, b) => new Date(b.row.published_at || b.row.created_at || 0) - new Date(a.row.published_at || a.row.created_at || 0))
      .filter((x) => (x.row.url && seen.has(x.row.url) ? false : seen.add(x.row.url)))
      .map((x) => toItem(x.row, x.label));

    return Response.json({
      district: 'all',
      items: items.slice(offset, offset + limit),
      total: items.length,
      offset,
      limit,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
