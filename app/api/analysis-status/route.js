import { getSupabase } from '../../../lib/supabase';

export async function GET() {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ pending: 0, active: false }, { status: 500 });
    const [{ count }, { data: lastCycle }] = await Promise.all([
        supabase.from('raw_items').select('id', { count: 'exact', head: true }).eq('gemini_processed', false),
        supabase.from('processing_logs').select('completed_at, processed, failed').order('completed_at', { ascending: false }).limit(1).maybeSingle()
    ]);
    return Response.json({ pending: count || 0, active: true, last_cycle: lastCycle || null });
}