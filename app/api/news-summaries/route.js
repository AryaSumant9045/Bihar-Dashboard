/**
 * app/api/news-summaries/route.js - News Summaries API
 * --------------------------------------------------------
 * Yeh endpoint database (Supabase) se processed aur summarize ki gayi news nikaal kar
 * frontend (War Room dashboard) ko bhejta hai.
 * --------------------------------------------------------
 * GET /api/news-summaries
 * ============================================================
 * Returns news summaries from the rolling pipeline for War Room rendering.
 *
 * Query params:
 *   latest=true        — just the most recent final summary (default)
 *   session_id=UUID    — all summaries for a specific session
 *   limit=N            — max results (default 10)
 *   include_batches=true — include non-final batch summaries too
 * ============================================================
 */

import { getSupabase } from '../../../lib/supabase.js';

export async function GET(request) {
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ status: 'success', data: [], total: 0, current_session: null });
  }

  const { searchParams } = new URL(request.url);
  const sessionId      = searchParams.get('session_id');
  const latestOnly     = searchParams.get('latest') !== 'false';
  const includeBatches = searchParams.get('include_batches') === 'true';
  const limit          = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

  try {
    let query = supabase
      .from('news_summaries')
      .select(`
        id,
        cron_session_id,
        batch_number,
        batch_size,
        news_headlines,
        summary_content,
        inference,
        llm_provider,
        llm_model,
        input_tokens,
        output_tokens,
        is_final,
        previous_summary_id,
        processing_time_ms,
        created_at,
        cron_sessions (
          schedule_slot,
          status,
          total_fetched,
          total_new,
          total_processed,
          total_batches,
          started_at,
          completed_at
        )
      `)
      .order('created_at', { ascending: false });

    // Filter by session if provided
    if (sessionId) {
      query = query.eq('cron_session_id', sessionId);
    } else if (latestOnly) {
      query = query.eq('is_final', true);
    } else if (!includeBatches) {
      query = query.eq('is_final', true);
    }

    query = query.limit(limit);

    const { data, error } = await query;

    // If table doesn't exist yet (migration not run), return empty gracefully
    if (error) {
      const isTableMissing = error.message?.includes('does not exist') || error.code === '42P01';
      if (isTableMissing) {
        return Response.json(
          { status: 'success', data: [], total: 0, current_session: null, note: 'Run SQL migration 008 to enable this feature' },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }
      return Response.json({ status: 'success', data: [], total: 0, current_session: null });
    }

    // Also get active/recent session status (graceful if cron_sessions table missing)
    let recentSession = null;
    try {
      const { data: sessionData } = await supabase
        .from('cron_sessions')
        .select('id, schedule_slot, status, total_fetched, total_processed, total_batches, started_at, completed_at')
        .eq('session_type', 'news_fetch')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      recentSession = sessionData || null;
    } catch { /* table may not exist yet */ }

    return Response.json(
      {
        status: 'success',
        data:   data || [],
        total:  data?.length || 0,
        current_session: recentSession,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    // Always return success with empty data — never 500 to the UI
    console.error('[news-summaries] Error:', err.message);
    return Response.json(
      { status: 'success', data: [], total: 0, current_session: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

