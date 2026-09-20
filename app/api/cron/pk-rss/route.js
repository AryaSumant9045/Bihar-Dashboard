/**
 * app/api/cron/pk-rss/route.js
 * ------------------------------------------------------------
 * Daily ingestion of the FetchRSS PK feed into public.pk_rss.
 *   Source: https://fetchrss.com/feed/1x37QR7qqGaQ1x37Qc0ePC1r.rss
 * Dedup: UNIQUE(heading) + onConflict 'heading' ignoreDuplicates.
 *
 * GET/POST /api/cron/pk-rss   (auth: ?secret=CRON_SECRET or Bearer)
 * ============================================================
 */

import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const FEED_URL = 'https://fetchrss.com/feed/1x37QR7qqGaQ1x37Qc0ePC1r.rss';

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

async function handle(request) {
  const authHeader = request.headers.get('authorization') || '';
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || '';
  const cronSecret = (process.env.CRON_SECRET || 'bihar-cron-secret-2026');
  const isUpstash = !!request.headers.get('upstash-signature');
  const isAuthorized = isUpstash || authHeader === `Bearer ${cronSecret}` || (!!cronSecret && secret === cronSecret);
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    const res = await fetch(FEED_URL, { cache: 'no-store', headers: { 'User-Agent': 'Bihar-Dashboard/2.0' } });
    if (!res.ok) throw new Error(`FetchRSS returned ${res.status}`);
    const xml = await res.text();
    const feed = await new Parser().parseString(xml);
    const items = feed.items || [];

    const rows = items.slice(0, 30).map(item => ({
      heading: (item.title || '').trim().slice(0, 500),
      url: item.link || item.guid || null,
      published_at: item.isoDate || item.pubDate || null,
    })).filter(r => r.heading);

    if (!rows.length) return NextResponse.json({ status: 'skipped', message: 'Feed empty' });

    const { data, error } = await supabase
      .from('pk_rss')
      .upsert(rows, { onConflict: 'heading', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;

    console.log(`[pk-rss] Fetched ${rows.length}, inserted ${data?.length || 0} new.`);
    return NextResponse.json({ status: 'success', fetched: rows.length, inserted: data?.length || 0 });
  } catch (err) {
    console.error('[pk-rss] ERROR:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
