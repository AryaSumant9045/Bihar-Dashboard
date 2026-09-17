/**
 * GET /api/opposition-live
 * ============================================================
 * Public endpoint — no auth required.
 * Returns latest opposition_news (grouped by party) + latest opposition_summary.
 * Polled by the UI every 90 seconds.
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
  
  // Force no-store on Supabase fetch to prevent Next.js from caching the DB query
  return createClient(url, key, {
    global: {
      fetch: (...args) => {
        return fetch(args[0], { ...args[1], cache: 'no-store' });
      }
    }
  });
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // Fetch latest news (all parties) and latest summary in parallel
    const [newsResult, summaryResult] = await Promise.all([
      supabase
        .from('opposition_news')
        .select('id, party, source_type, source_name, heading, video_id, url, published_at, created_at')
        .order('created_at', { ascending: false })
        .limit(150),
      supabase
        .from('opposition_summary')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const news = newsResult.data || [];
    const summary = (summaryResult.data && summaryResult.data.length > 0) ? summaryResult.data[0] : null;

    // Group news by party
    const PARTIES = ['Jan Suraaj', 'INC', 'RJD', 'Tejashwi Yadav'];
    const grouped = {};
    for (const party of PARTIES) {
      grouped[party] = news.filter(n => n.party === party);
    }

    // Counts per party
    const counts = {};
    for (const party of PARTIES) {
      counts[party] = grouped[party].length;
    }

    return Response.json(
      {
        status:   'success',
        summary,
        news:     grouped,
        counts,
        total:    news.length,
        fetched_at: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[opposition-live] Error:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
