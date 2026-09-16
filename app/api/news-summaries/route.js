import { createClient } from '@supabase/supabase-js';

/**
 * app/api/news-summaries/route.js - News Summaries API
 * --------------------------------------------------------
 * Yeh endpoint database (Supabase) se processed aur summarize ki gayi news nikaal kar
 * frontend (War Room dashboard) ko bhejta hai.
 * --------------------------------------------------------
 */
export async function GET(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = url && key ? createClient(url, key) : null;

  if (!supabase) {
    return Response.json({ status: 'success', data: [], total: 0, current_session: null });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 50);

  try {
    // Fetch from the new 'news_insights' table
    const { data, error } = await supabase
      .from('news_insights')
      .select(`
        id,
        overall_situation,
        bjp_action_points,
        political_risks,
        opposition_activity,
        counter_strategy_points,
        election_watch_items,
        news_count,
        created_at
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[news-summaries] DB Error:', error.message);
      const isTableMissing = error.message?.includes('does not exist') || error.code === '42P01';
      if (isTableMissing) {
        return Response.json(
          { status: 'success', data: [], total: 0, current_session: null, note: 'news_insights table missing' },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }
      return Response.json({ status: 'success', data: [], total: 0, current_session: null });
    }

    console.log(`[UI] Analysis insight fetched from DB and rendered on UI (Items: ${data?.length || 0})`);
    return Response.json(
      {
        status: 'success',
        data: data || [],
        total: data?.length || 0,
        current_session: null, // Since we don't have cron_sessions for news_insights anymore
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[news-summaries] Error:', err.message);
    return Response.json(
      { status: 'success', data: [], total: 0, current_session: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
