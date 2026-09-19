/**
 * app/api/issues/route.js
 * ------------------------------------------------------------
 * Reader for the public.issues table (populated by
 * /api/cron/issues-pipeline). Powers the "📋 Issues & Grievances"
 * page — district-wise live issue list + stats.
 *
 * GET /api/issues?district=all&status=all&priority=all&limit=50
 * Returns { has_data, items, stats, total }
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
    const status = (searchParams.get('status') || 'all').trim();
    const priority = (searchParams.get('priority') || 'all').trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 50, 1), 100);

    const supabase = getSupabase();
    if (!supabase) return Response.json({ has_data: false, reason: 'Supabase not configured' });

    let query = supabase
      .from('issues')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (district !== 'all') query = query.ilike('district', district);
    if (status !== 'all') query = query.eq('status', status);
    if (priority !== 'all') query = query.eq('priority', priority);

    const { data, error, count } = await query;
    if (error) throw error;

    const items = data || [];
    const stats = {
      total: items.length,
      urgent: items.filter(i => i.priority === 'urgent').length,
      in_progress: items.filter(i => i.status === 'in-progress').length,
      open: items.filter(i => i.status === 'open').length,
      escalated: items.filter(i => i.status === 'escalated').length,
    };

    return Response.json(
      { has_data: items.length > 0, items, stats, total: count ?? items.length },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[issues API] Error:', err.message);
    return Response.json({ has_data: false, error: err.message }, { status: 500 });
  }
}
