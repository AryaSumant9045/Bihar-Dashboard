/**
 * GET /api/alerts
 * Returns high-priority alerts for the homepage "3 Things Requiring Attention" card.
 *
 * Query params:
 *   unread_only — "true" to get only unread alerts (default: true)
 *   limit       — max results (default 10)
 */

import { getSupabase } from '../../../lib/supabase';

export async function GET(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread_only') !== 'false'; // default true
  const limit      = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

  let query = supabase
    .from('alerts')
    .select('id, priority, title, summary, district, module, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(
    { status: 'success', data: data || [], count: (data || []).length },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * PATCH /api/alerts
 * Mark an alert as read.
 * Body: { id: string } or { mark_all_read: true }
 */
export async function PATCH(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.json();

  if (body.mark_all_read) {
    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true })
      .eq('is_read', false);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ status: 'success', message: 'All alerts marked as read' });
  }

  if (!body.id) {
    return Response.json({ error: 'Missing alert id' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('alerts')
    .update({ is_read: true })
    .eq('id', body.id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ status: 'success', data });
}
