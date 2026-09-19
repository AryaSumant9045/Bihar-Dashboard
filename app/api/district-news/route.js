/**
 * app/api/district-news/route.js
 * Reader for the district_news table (populated by /api/cron/district-news).
 * GET /api/district-news?district=all&keyword=bihar&limit=5&offset=0  (district=all → mixed latest)
 * Returns { items, total } so the UI can page through in "read more" chunks.
 */

import { getSupabase } from '../../../lib/supabase.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const districtInput = (searchParams.get('district') || 'all');
  const district = districtInput.toLowerCase();
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

  /* District filter — use case-insensitive matching for district column */
  if (district !== 'all') {
    const districtValue = district === 'bihar' ? null : districtInput; // preserve original case
    // Use case-insensitive match: compare lower(district) == lower(input)
    if (districtValue !== null) {
      query = query.ilike('district', districtInput);
    } else {
      query = query.eq('district', null); // special case for Bihar state news
    }
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
