/**
 * GET /api/x-social
 * ============================================================
 * Fetch X (Twitter) posts from Supabase tables.
 * Used by "X Social Pulse" (Opposition page) and PK Tracker.
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  
  return createClient(url, key, {
    global: {
      fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' })
    }
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const specificTable = searchParams.get('table');
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    
    const supabase = getSupabase();
    
    // If a specific table is requested (e.g. for PK Tracker)
    if (specificTable) {
      const allowedTables = ['xjansuraaj', 'xinc', 'xrahulgandi', 'xrjd', 'xtejwaniyd'];
      if (!allowedTables.includes(specificTable)) {
        return Response.json({ error: 'Invalid table' }, { status: 400 });
      }
      
      const { data, error } = await supabase
        .from(specificTable)
        .select('*')
        .order('published_at', { ascending: false })
        .range(offset, offset + limit - 1);
        
      if (error) throw error;
      return Response.json({ status: 'success', data: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
    }
    
    // Otherwise fetch all 5 for Opposition page
    const queries = [
      supabase.from('xjansuraaj').select('*').order('published_at', { ascending: false }).limit(limit),
      supabase.from('xinc').select('*').order('published_at', { ascending: false }).limit(limit),
      supabase.from('xrahulgandi').select('*').order('published_at', { ascending: false }).limit(limit),
      supabase.from('xrjd').select('*').order('published_at', { ascending: false }).limit(limit),
      supabase.from('xtejwaniyd').select('*').order('published_at', { ascending: false }).limit(limit)
    ];
    
    const results = await Promise.all(queries);
    results.forEach(r => { if (r.error) throw r.error; });
    
    return Response.json({
      status: 'success',
      data: {
        jansuraaj: results[0].data || [],
        inc_bihar: results[1].data || [],
        rahul_gandhi: results[2].data || [],
        rjd_india: results[3].data || [],
        tejashwi: results[4].data || []
      }
    }, { headers: { 'Cache-Control': 'no-store' } });
    
  } catch (err) {
    console.error('[x-social API] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
