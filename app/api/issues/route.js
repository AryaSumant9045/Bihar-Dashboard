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

/**
 * PATCH /api/issues  { id, status?, assigned_to? }
 * War-room action: Assign (→ in-progress + assignee) / Escalate (→ escalated).
 * Persists to Supabase so status survives refresh and is shared across users.
 */
export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = body.id;
    if (id === undefined || id === null) {
      return Response.json({ error: 'id required' }, { status: 400 });
    }

    const updates = {};
    if (body.status && ['open', 'in-progress', 'escalated', 'resolved'].includes(body.status)) {
      updates.status = body.status;
    }
    if (body.assigned_to !== undefined) {
      updates.assigned_to = body.assigned_to ? String(body.assigned_to).slice(0, 100) : null;
    }
    if (!Object.keys(updates).length) {
      return Response.json({ error: 'nothing to update' }, { status: 400 });
    }

    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

    const { data, error } = await supabase
      .from('issues')
      .update(updates)
      .eq('id', id)
      .select('id, status, assigned_to');
    if (error) throw error;
    if (!data || !data.length) return Response.json({ error: 'Issue not found' }, { status: 404 });

    return Response.json({ status: 'success', issue: data[0] });
  } catch (err) {
    console.error('[issues API] PATCH error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
