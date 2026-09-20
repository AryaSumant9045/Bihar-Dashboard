/**
 * GET /api/pk-summary
 * Returns the latest AI-generated PK Tracker intelligence summary.
 * Consumed by the PK Tracker page "AI Intelligence Summary" card.
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

export async function GET() {
  try {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ has_data: false, reason: 'Supabase not configured' });

    const { data, error } = await supabase
      .from('pk_tracker_summary')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || !data.length) return Response.json({ has_data: false });

    return Response.json({ has_data: true, summary: data[0] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[pk-summary API] Error:', err.message);
    return Response.json({ has_data: false, error: err.message });
  }
}
