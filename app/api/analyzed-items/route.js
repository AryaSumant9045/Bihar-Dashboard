/**
 * GET /api/analyzed-items
 * Reads structured AI-analyzed data from analyzed_items table.
 *
 * Query params (all optional):
 *   module   — filter by module (e.g. "Opposition Tracker")
 *   district — filter by district (e.g. "Patna")
 *   priority — filter by priority (e.g. "Critical")
 *   status   — filter by status (e.g. "नया")
 *   limit    — max results (default 50)
 *   offset   — pagination offset (default 0)
 */

import { getSupabase } from '../../../lib/supabase';

export async function GET(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const module_filter = searchParams.get('module');
  const district_filter = searchParams.get('district');
  const priority_filter = searchParams.get('priority');
  const status_filter = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');

  const selectFields = `
      id,
      raw_item_id,
      module,
      district,
      who,
      event_type,
      issue,
      public_statement,
      public_reach_indicator,
      factual_context_needed,
      priority,
      priority_reason,
      source_reliability,
      summary,
      status,
      created_at,
      raw_items (
        title,
        url,
        source_name,
        source_type,
        published_at
      )
    `;

  const buildQuery = () => {
    let nextQuery = supabase
      .from('analyzed_items')
      .select(selectFields)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (module_filter) nextQuery = nextQuery.eq('module', module_filter);
    if (district_filter) nextQuery = nextQuery.eq('district', district_filter);
    if (priority_filter) nextQuery = nextQuery.eq('priority', priority_filter);
    if (status_filter) nextQuery = nextQuery.eq('status', status_filter);
    return nextQuery;
  };

  const result = await buildQuery();
  const { data, error, count } = result;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(
    { status: 'success', data: data || [], total: count },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * PATCH /api/analyzed-items
 * Update status of an analyzed item (e.g. mark as reviewed or closed).
 * Body: { id: string, status: "नया" | "review हुआ" | "closed" }
 */
export async function PATCH(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const { id, status } = await request.json();
  const validStatuses = ['नया', 'review हुआ', 'closed'];

  if (!id || !validStatuses.includes(status)) {
    return Response.json({ error: 'Invalid id or status' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('analyzed_items')
    .update({ status })
    .eq('id', id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ status: 'success', data });
}
