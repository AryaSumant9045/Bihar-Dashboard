/**
 * GET /api/cron/cleanup
 * ============================================================
 * Weekly cleanup cron — deletes data older than 7 days.
 *
 * Schedule: Every Sunday 3:00 AM IST = Saturday 9:30 PM UTC
 *   Cron expression: 30 21 * * 0
 *
 * Security: ?secret=CRON_SECRET query param required
 * ============================================================
 */

import { getSupabase } from '../../../../lib/supabase.js';

export const maxDuration = 60;

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const secret = (process.env.CRON_SECRET || 'bihar-cron-secret-2026');

  if (secret) {
    const provided = searchParams.get('secret')
      || request.headers.get('authorization')?.replace('Bearer ', '');
    if (provided !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const daysToKeep = parseInt(searchParams.get('days') || '7');
  console.log(`[Cron] cleanup triggered — deleting data older than ${daysToKeep} days`);

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    // Log the cleanup session
    const { data: sessionData } = await supabase
      .from('cron_sessions')
      .insert({
        session_type:  'cleanup',
        schedule_slot: 'morning',
        status:        'running',
        started_at:    new Date().toISOString(),
      })
      .select('id')
      .single();

    // Call the cleanup Postgres function
    const { data, error } = await supabase.rpc('cleanup_old_data', {
      days_to_keep: daysToKeep,
    });

    if (error) {
      console.error('[Cron] cleanup RPC error:', error.message);
      if (sessionData?.id) {
        await supabase
          .from('cron_sessions')
          .update({ status: 'failed', error_message: error.message, completed_at: new Date().toISOString() })
          .eq('id', sessionData.id);
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    const result = data || {};
    console.log('[Cron] cleanup result:', result);

    // ── Clean opposition tables (not covered by the Postgres RPC) ──
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();

    const [oppNewsRes, oppSummaryRes] = await Promise.allSettled([
      supabase.from('opposition_news').delete().lt('created_at', cutoffDate),
      supabase.from('opposition_summary').delete().lt('created_at', cutoffDate),
    ]);

    const deletedOppNews    = oppNewsRes.status    === 'fulfilled' ? (oppNewsRes.value.count    || 0) : 0;
    const deletedOppSummary = oppSummaryRes.status === 'fulfilled' ? (oppSummaryRes.value.count || 0) : 0;
    console.log(`[Cron] opposition_news deleted: ${deletedOppNews}, opposition_summary deleted: ${deletedOppSummary}`);

    if (sessionData?.id) {
      await supabase
        .from('cron_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', sessionData.id);
    }

    return Response.json({
      status:       'success',
      days_kept:    daysToKeep,
      cutoff:       result.cutoff || cutoffDate,
      deleted: {
        raw_items:           result.deleted_raw_items     || 0,
        analyzed:            result.deleted_analyzed      || 0,
        summaries:           result.deleted_summaries     || 0,
        sessions:            result.deleted_sessions      || 0,
        alerts:              result.deleted_alerts        || 0,
        errors:              result.deleted_errors        || 0,
        opposition_news:     deletedOppNews,
        opposition_summary:  deletedOppSummary,
      },
    });
  } catch (err) {
    console.error('[Cron] cleanup fatal error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
