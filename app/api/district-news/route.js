/**
 * app/api/district-news/route.js
 * Reader for the district_news table (populated by /api/cron/district-news).
 * GET /api/district-news?district=all&keyword=bihar&limit=5&offset=0  (district=all → mixed latest)
 * Returns { items, total } so the UI can page through in "read more" chunks.
 */

import { getSupabase } from '../../../lib/supabase.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const district = (searchParams.get('district') || 'all').toLowerCase();
  const keyword = (searchParams.get('keyword') || '').toLowerCase().trim();
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 5, 1), 50);
  const offset = Math.max(parseInt(searchParams.get('offset'), 10) || 0, 0);

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  let query = supabase
    .from('district_news')
    .select('*', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);

  /* District filter */
  if (district !== 'all') {
    query = query.eq('district', district === 'bihar' ? null : district); // special case for Bihar state news
  }

  /* Keyword filter — match title containing keyword */
  if (keyword.length >= 3) {
    query = query.ilike('title', `%${keyword}%`);
  } else if (district && district !== 'all') {
    /* If no keyword but district specified, also search in title */
    query = query.ilike('title', `%${district}%`);
  }

  const { data, error, count } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    district: district === 'bihar' ? 'Bihar' : district,
    items: data || [],
    total: count ?? (data ? data.length : 0),
    offset,
    limit,
  });
}
