import { getSupabase } from '../../../lib/supabase';

const VALID_STATUSES = new Set(['new', 'review', 'assigned', 'report', 'monitor', 'closed']);
const VALID_APPROVALS = new Set(['pending', 'approved', 'rejected']);

function clean(value, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : null;
}

export async function GET(request) {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    const itemId = new URL(request.url).searchParams.get('item_id');
    let query = supabase.from('war_room_actions').select('*').order('updated_at', { ascending: false });
    if (itemId) query = query.eq('item_id', itemId);
    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const actions = data || [];
    const ids = actions.map(action => action.id);
    const { data: history, error: historyError } = ids.length
        ? await supabase.from('war_room_action_history').select('*').in('action_id', ids).order('created_at', { ascending: false })
        : { data: [], error: null };
    if (historyError) return Response.json({ error: historyError.message }, { status: 500 });
    const historyByAction = (history || []).reduce((result, entry) => {
        (result[entry.action_id] ||= []).push(entry);
        return result;
    }, {});
    return Response.json({ status: 'success', data: actions.map(action => ({ ...action, history: historyByAction[action.id] || [] })) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    const body = await request.json().catch(() => ({}));
    if (!body.item_id || !body.title) return Response.json({ error: 'item_id and title are required' }, { status: 400 });
    if (body.status && !VALID_STATUSES.has(body.status)) return Response.json({ error: 'Invalid action status' }, { status: 400 });
    if (body.approval_status && !VALID_APPROVALS.has(body.approval_status)) return Response.json({ error: 'Invalid approval status' }, { status: 400 });

    const { data: existing } = await supabase.from('war_room_actions').select('*').eq('item_id', body.item_id).maybeSingle();
    const next = {
        item_id: clean(body.item_id, 300), title: clean(body.title, 500), source: clean(body.source, 200), priority: clean(body.priority, 50),
        status: body.status || existing?.status || 'new', assignee: clean(body.assignee, 120), comment: clean(body.comment, 2000),
        deadline: body.deadline || null, approval_status: body.approval_status || existing?.approval_status || 'pending',
        approved_by: clean(body.approved_by, 120), approved_at: body.approval_status === 'approved' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from('war_room_actions').upsert(next, { onConflict: 'item_id' }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const oldValue = existing ? { status: existing.status, assignee: existing.assignee, comment: existing.comment, deadline: existing.deadline, approval_status: existing.approval_status } : null;
    const newValue = { status: data.status, assignee: data.assignee, comment: data.comment, deadline: data.deadline, approval_status: data.approval_status };
    await supabase.from('war_room_action_history').insert({ action_id: data.id, item_id: data.item_id, action: existing ? 'updated' : 'created', old_value: oldValue, new_value: newValue, actor: clean(body.actor, 120) || 'War Room user' });
    return Response.json({ status: 'success', data });
}
