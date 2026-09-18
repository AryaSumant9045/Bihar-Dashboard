/**
 * app/api/district-news/route.js
 * Reader for the district_news table (populated by /api/cron/district-news).
 * GET /api/district-news?district=Patna&limit=12   (district=all → mixed latest)
 */

import { getSupabase } from '../../../lib/supabase.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get('district') || 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10) || 30, 100);

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  let query = supabase
    .from('district_news')
    .select('district,title,url,source,image_url,published_at')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (district !== 'all') query = query.eq('district', district);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ district, items: data || [] });
}
