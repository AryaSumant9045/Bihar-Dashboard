/**
 * app/api/cron/news-pipeline/route.js - Cron Job Pipeline
 * --------------------------------------------------------
 * Yeh file cron jobs (automated background tasks) ke liye hai.
 * Yeh har 15 minute mein call hoti hai aur thoda-thoda karke news fetch aur analyze karti hai
 * taaki server par ek sath load na pade (30 seconds limit ke andar).
 * --------------------------------------------------------
 * GET /api/cron/news-pipeline
 * ============================================================
 * Stateful single-batch endpoint — completes in <25 seconds.
 * Designed for cron-job.org FREE tier (30s max timeout).
 *
 * CALL THIS EVERY 15 MINUTES via cron-job.org.
 * One cron job handles everything — no need for separate jobs.
 *
 * What happens each call:
 *
 *  ┌─ Is there an active session (fetching/processing)?
 *  │
 *  ├─ YES → processNextBatch(sessionId)
 *  │        Pick 50 unprocessed items → LLM → save → return ✅
 *  │        (If no items left → mark session complete)
 *  │
 *  └─ NO  → Are we in a valid start window? (IST)
 *           Morning  6:30–9:00 AM
 *           Noon    12:00–3:00 PM
 *           Evening  7:30–10:00 PM
 *
 *           ├─ YES → fetchAndSaveNews() — Phase A
 *           │        Fetch all sources → save to raw_items → return ✅
 *           │        (No LLM, just fast HTTP. Next call will process.)
 *           │
 *           └─ NO  → return "skipped" (outside active window)
 *
 * Security: ?secret=CRON_SECRET query param
 *
 * cron-job.org schedule: Every 15 min
 *   Cron: * /15 1-16 * * *   (1:00 AM – 4:30 PM UTC = 6:30 AM – 10:00 PM IST)
 * ============================================================
 */

import {
  fetchAndSaveNews,
  processNextBatch,
  getActiveScheduleSlot,
} from '../../../../lib/news-summary-pipeline.js';
import { getSupabase } from '../../../../lib/supabase.js';

export const maxDuration = 60; // Max allowed on Vercel Hobby

export async function GET(request) {
  // ── Auth ────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const provided =
      searchParams.get('secret') ||
      request.headers.get('authorization')?.replace('Bearer ', '');
    if (provided !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  console.log(`[Cron] news-pipeline called at ${new Date().toISOString()}`);

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    // ── Step 1: Check for active session ─────────────────────
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: activeSession } = await supabase
      .from('cron_sessions')
      .select('id, status, schedule_slot, total_fetched, total_new, total_processed, total_batches')
      .in('status', ['fetching', 'processing'])
      .eq('session_type', 'news_fetch')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (activeSession) {
      // ── Phase B: Process one batch ──────────────────────────
      console.log(`[Cron] Active session ${activeSession.id} (${activeSession.status}) — processing next batch`);
      const result = await processNextBatch(activeSession.id);
      return Response.json({
        status:      'success',
        phase:       result.action,
        session_id:  activeSession.id,
        slot:        activeSession.schedule_slot,
        ...result,
      });
    }

    // ── Step 2: No active session — check time window ────────
    const slot = searchParams.get('slot') || getActiveScheduleSlot();

    if (!slot) {
      console.log('[Cron] Outside active windows — skipping');
      return Response.json({
        status:  'skipped',
        reason:  'Outside active windows (6:30-9AM / 12-3PM / 7:30-10PM IST)',
        utc_now: new Date().toISOString(),
      });
    }

    // ── Phase A: Fetch all news ───────────────────────────────
    console.log(`[Cron] No active session. Starting ${slot} fetch...`);
    const fetchResult = await fetchAndSaveNews(slot);

    return Response.json({
      status:        'success',
      phase:         'fetch_complete',
      schedule_slot: slot,
      session_id:    fetchResult.sessionId,
      total_fetched: fetchResult.totalFetched,
      total_new:     fetchResult.totalNew,
      message:       `Fetched ${fetchResult.totalNew} new items. Next call will start processing.`,
    });

  } catch (err) {
    console.error('[Cron] news-pipeline error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
