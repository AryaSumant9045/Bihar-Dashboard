/**
 * GET/POST /api/cron/x-social-pipeline
 * ============================================================
 * X (Twitter) Social Pulse ingestion cron.
 * Fetches 5 RSSHub feeds directly (no Render backend dependency).
 * Handles Render cold-start: 60s timeout + 2 retries × 15s delay.
 * Saves to: xjansuraaj, xinc, xrahulgandi, xrjd, xtejwaniyd tables.
 * 
 * Schedule (UTC): 23:30, 10:30, 15:30  →  5AM, 4PM, 9PM IST
 * Auth: CRON_SECRET header or ?secret= query, Upstash-Signature allowed.
 * ============================================================
 */

import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const RSSHUB_BASE = 'https://rsshub-9o9d.onrender.com/twitter/user/';

const X_ACCOUNTS = [
  { handle: 'jansuraajonline', table: 'xjansuraaj' },
  { handle: 'INCBihar',        table: 'xinc' },
  { handle: 'RahulGandhi',     table: 'xrahulgandi' },
  { handle: 'RJDforIndia',     table: 'xrjd' },
  { handle: 'yadavtejashwi',   table: 'xtejwaniyd' },
];

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

const rssParser = new Parser({
  timeout: 65000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; Bihar-Dashboard/2.0; +https://bihar-command-center.vercel.app)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

// Fetch with timeout + abort
async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FeedBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// Fetch one account with retry
async function fetchOneAccount(handle, table, supabase, errors) {
  const url = `${RSSHUB_BASE}${handle}`;
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 15000;
  const TIMEOUT_MS = 58000; // Keep well under Vercel's maxDuration of 60s

  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[X-Social] Retry ${attempt}/${MAX_RETRIES} for @${handle} in ${RETRY_DELAY_MS/1000}s...`);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    try {
      console.log(`[X-Social] Fetching @${handle} (attempt ${attempt + 1})...`);
      const res = await fetchWithTimeout(url, TIMEOUT_MS);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const xml = await res.text();
      if (!xml || xml.trim().length < 100) {
        throw new Error('Empty or too-short response');
      }

      const feed = await rssParser.parseString(xml);
      const items = feed.items || [];
      console.log(`[X-Social] @${handle}: got ${items.length} feed entries`);

      if (!items.length) {
        return { handle, success: true, inserted: 0, note: 'empty feed' };
      }

      const rows = items.slice(0, 20).map(item => ({
        handle,
        heading: (item.title || '').trim().slice(0, 500),
        url:     item.link || item.guid || null,
        published_at: item.isoDate || item.pubDate || null,
      })).filter(r => r.heading);

      if (!rows.length) {
        return { handle, success: true, inserted: 0, note: 'no titles in feed' };
      }

      // Upsert — UNIQUE(handle, heading) constraint handles dedup
      const { data, error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: 'handle,heading', ignoreDuplicates: true })
        .select('id');

      if (error) {
        throw new Error(`Supabase upsert error: ${error.message}`);
      }

      const inserted = data?.length || 0;
      console.log(`[X-Social] @${handle} → ${table}: ${inserted} new rows`);
      return { handle, table, success: true, inserted, total_fetched: rows.length };

    } catch (err) {
      lastError = err;
      console.warn(`[X-Social] Attempt ${attempt + 1} failed for @${handle}: ${err.message}`);
      if (attempt < MAX_RETRIES) continue;
    }
  }

  const msg = lastError?.message || 'Unknown error';
  errors.push(`@${handle}: ${msg}`);
  return { handle, table, success: false, error: msg };
}

async function handlePipeline(request) {
  const { searchParams } = new URL(request.url);
  const isDebug = searchParams.get('debug') === '1';

  // Auth — same pattern as opposition-pipeline
  const cronSecret  = (process.env.CRON_SECRET || 'bihar-cron-secret-2026');
  const provided    = searchParams.get('secret') ||
                      request.headers.get('authorization')?.replace('Bearer ', '');
  const isUpstash   = !!request.headers.get('upstash-signature');

  if (cronSecret && !isUpstash && provided !== cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log(`[X-Social] Pipeline started at ${new Date().toISOString()}`);
  const supabase = getSupabase();
  const errors   = [];

  // NOTE: Cannot run all 5 truly in parallel because each has up to 2x15s retries
  // and Vercel maxDuration = 60s. Run in parallel but they race within the window.
  const results = await Promise.all(
    X_ACCOUNTS.map(({ handle, table }) => fetchOneAccount(handle, table, supabase, errors))
  );

  const totalInserted = results.reduce((s, r) => s + (r.inserted || 0), 0);
  const failed        = results.filter(r => !r.success);

  console.log(`[X-Social] Done. Inserted: ${totalInserted}, Failed: ${failed.length}`);

  return Response.json({
    status:          failed.length === 0 ? 'success' : (failed.length < X_ACCOUNTS.length ? 'partial' : 'failed'),
    total_inserted:  totalInserted,
    failed_count:    failed.length,
    timestamp:       new Date().toISOString(),
    ...(isDebug ? { results, errors } : {}),
  });
}

export async function GET(request) {
  try  { return await handlePipeline(request); }
  catch (err) {
    console.error('[X-Social] Fatal:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
