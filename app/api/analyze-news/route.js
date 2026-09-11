import { getSupabase } from '../../../lib/supabase';
import { runAnalysisCycle } from '../../../lib/gemini-analysis';

// Emergency force-refresh endpoint; normal processing uses /api/cron/analyze or local instrumentation.
export async function POST() {
    if (!getSupabase()) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    try { return Response.json({ status: 'success', ...await runAnalysisCycle({ trigger: 'manual' }) }); }
    catch (error) { return Response.json({ error: error.message }, { status: 500 }); }
}

export async function GET() {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ pending: 0, active: false }, { status: 500 });
    const { count } = await supabase.from('raw_items').select('id', { count: 'exact', head: true }).eq('gemini_processed', false);
    return Response.json({ pending: count || 0 });
}