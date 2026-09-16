const fs = require('fs');

const content = `import { getSupabase } from '../../../lib/supabase.js';

/**
 * app/api/news-summaries/route.js - News Summaries API
 * --------------------------------------------------------
 * Yeh endpoint database (Supabase) se processed aur summarize ki gayi news nikaal kar
 * frontend (War Room dashboard) ko bhejta hai.
 * --------------------------------------------------------
 */
export async function GET(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ status: 'success', data: [], total: 0, current_session: null });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 50);

  try {
    // Fetch from the 'news_summaries' table
    const { data, error } = await supabase
      .from('news_summaries')
      .select('id, inference, batch_size, llm_provider, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[news-summaries] DB Error:', error.message);
      return Response.json({ status: 'success', data: [], total: 0, current_session: null, error: error.message });
    }

    // Map the JSON inference back to the flat format expected by War Room UI
    const mappedData = (data || []).map(row => {
      const inf = row.inference || {};
      return {
        id: row.id,
        overall_situation: inf.overall_situation || '',
        bjp_action_points: inf.bjp_action_points || [],
        political_risks: inf.political_risks || [],
        opposition_activity: inf.opposition_activity || [],
        counter_strategy_points: inf.counter_strategy_points || [],
        election_watch_items: inf.election_watch_items || [],
        news_count: row.batch_size,
        llm_provider: row.llm_provider,
        created_at: row.created_at
      };
    });

    return Response.json(
      {
        status: 'success',
        data: mappedData,
        total: mappedData.length,
        current_session: null,
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
`;

fs.writeFileSync('app/api/news-summaries/route.js', content);
