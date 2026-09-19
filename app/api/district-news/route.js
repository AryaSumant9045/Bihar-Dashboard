/**
 * app/api/district-news/route.js
 * Reader for the district_news table (populated by /api/cron/district-news).
 * GET /api/district-news?district=Patna&limit=5&offset=0  (district=all → mixed latest)
 * Returns { items, total } so the UI can page through in "read more" chunks.
 */

import { getSupabase } from '../../../lib/supabase.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get('district') || 'all';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 5, 1), 50);
  const offset = Math.max(parseInt(searchParams.get('offset'), 10) || 0, 0);

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  let query = supabase
    .from('district_news')
    .select('district,title,url,source,image_url,published_at', { count: 'exact' })
    .order('published_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (district !== 'all') query = query.eq('district', district);

  const { data, error, count } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({
    district,
    items: data || [],
    total: count ?? (data ? data.length : 0),
    offset,
    limit,
  });
}
