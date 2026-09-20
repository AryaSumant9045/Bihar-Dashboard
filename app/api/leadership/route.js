/**
 * app/api/leadership/route.js
 * ------------------------------------------------------------
 * Reader for the Leadership Tracker page.
 * GET /api/leadership?district=all&category=all&limit=20
 * Returns { has_data, leaders, activities, stats, heatmap, updated_at }
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const district = (searchParams.get('district') || 'all').trim();
    const category = (searchParams.get('category') || 'all').trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 20, 1), 100);

    const supabase = getSupabase();
    if (!supabase) return Response.json({ has_data: false, reason: 'Supabase not configured' });

    // Leaders (LPI board) — ordered by LPI desc
    let lq = supabase.from('leaders').select('*').order('lpi', { ascending: false }).limit(50);
    if (category !== 'all') lq = lq.eq('category', category);
    const { data: leaders, error: lerr } = await lq;
    if (lerr) throw lerr;

    // Activities — latest first, optional district filter
    let aq = supabase.from('leader_activities').select('*')
      .order('occurred_at', { ascending: false }).limit(limit);
    if (district !== 'all') aq = aq.ilike('district', district);
    if (category !== 'all') aq = aq.eq('category', category);
    const { data: activities, error: aerr } = await aq;
    if (aerr) throw aerr;

    const acts = activities || [];
    const leadersList = leaders || [];

    // District footprint heatmap (count of activities per district)
    const heatmap = {};
    acts.forEach(a => { const d = a.district || 'Multiple'; heatmap[d] = (heatmap[d] || 0) + 1; });

    const stats = {
      total_leaders: leadersList.length,
      total_activities: acts.length,
      critical: acts.filter(a => a.priority === 'CRITICAL').length,
      developing: acts.filter(a => a.priority === 'DEVELOPING').length,
      routine: acts.filter(a => a.priority === 'ROUTINE').length,
    };

    const latest = acts[0]?.occurred_at || leadersList[0]?.updated_at || null;

    return Response.json(
      { has_data: leadersList.length > 0 || acts.length > 0, leaders: leadersList, activities: acts, stats, heatmap, updated_at: latest },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[leadership API] Error:', err.message);
    return Response.json({ has_data: false, error: err.message }, { status: 500 });
  }
}
