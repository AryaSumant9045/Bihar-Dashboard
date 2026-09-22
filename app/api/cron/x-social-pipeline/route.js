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
  /* Jan Suraaj: official handle ka RSSHub feed khaali aata hai (0 items), isliye
     party founder Prashant Kishor ka handle bhi usi table me bhej rahe hain. */
  { handle: 'jansuraajonline', table: 'xjansuraaj' },
  { handle: 'PrashantKishor',  table: 'xjansuraaj' },
  { handle: 'INCBihar',        table: 'xinc' },
  { handle: 'RahulGandhi',     table: 'xrahulgandi' },
  { handle: 'RJDforIndia',     table: 'xrjd' },
  { handle: 'yadavtejashwi',   table: 'xtejwaniyd' },
];

/* Har table ke liye fallback search query — RSSHub (X) fail/thanda ho to
   Google News RSS se us party ki fresh khabar same table me daal dete hain. */
const FALLBACK_QUERY = {
  xjansuraaj:   'जन सुराज बिहार',
  xinc:         'बिहार कांग्रेस',
  xrahulgandi:  'राहुल गांधी बिहार',
  xrjd:         'राजद बिहार',
  xtejwaniyd:   'तेजस्वी यादव',
};

function parseItemsFromXml(xml) {
  const out = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const b = m[1];
    const grab = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
      const mm = b.match(r);
      return mm ? mm[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    };
    const title = grab('title');
    const link = grab('link');
    if (title && link) out.push({ title, link, pubDate: grab('pubDate') });
  }
  return out;
}

async function googleNewsFallback(table, limit = 15) {
  const q = FALLBACK_QUERY[table];
  if (!q) return [];
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=hi-IN&gl=IN&ceid=IN:hi`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiharDashboardBot/1.0)' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`google-news HTTP ${res.status}`);
  const xml = await res.text();
  return parseItemsFromXml(xml).slice(0, limit).map((it) => ({
    handle: `${table.replace(/^x/, '')}-news`,
    heading: String(it.title).slice(0, 500),
    url: it.link,
    published_at: (() => { const t = Date.parse(it.pubDate); return isNaN(t) ? null : new Date(t).toISOString(); })(),
  }));
}

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
        /* X feed khaali (RSSHub degraded) → Google News se fresh khabar same table me */
        let fbInserted = 0;
        let fbNote = 'empty feed';
        try {
          const fbRows = await googleNewsFallback(table);
          if (fbRows.length) {
            const { data: fbData, error: fbErr } = await supabase
              .from(table)
              .upsert(fbRows, { onConflict: 'handle,heading', ignoreDuplicates: true })
              .select('id');
            if (fbErr) fbNote = 'empty feed + news fallback error: ' + fbErr.message.slice(0, 60);
            else { fbInserted = fbData?.length || 0; fbNote = `empty feed → news fallback (${fbInserted} new)`; }
          }
        } catch (e) { fbNote = 'empty feed + fallback failed: ' + String(e.message).slice(0, 60); }
        return { handle, table, success: true, inserted: fbInserted, note: fbNote, source: 'google-news' };
      }

      /* Feed items bhale hi aayein, par purane (stale) ho sakte hain — us case me bhi
         news fallback chalate hain taaki table me fresh content rahe. */
      const newestMs = Math.max(0, ...items.map((i) => Date.parse(i.isoDate || i.pubDate || '') || 0));
      const staleFeed = newestMs > 0 && (Date.now() - newestMs) > 3 * 86400000;

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

      let inserted = data?.length || 0;
      let note = staleFeed ? 'feed stale (>3 din purana)' : undefined;
      /* Stale feed + news fallback se fresh content bhi add karo */
      if (staleFeed) {
        try {
          const fbRows = await googleNewsFallback(table);
          if (fbRows.length) {
            const { data: fbData } = await supabase.from(table).upsert(fbRows, { onConflict: 'handle,heading', ignoreDuplicates: true }).select('id');
            inserted += fbData?.length || 0;
            note = `feed stale → +${fbData?.length || 0} news`;
          }
        } catch (e) { note = 'feed stale, fallback failed'; }
      }
      console.log(`[X-Social] @${handle} → ${table}: ${inserted} new rows${note ? ' (' + note + ')' : ''}`);
      return { handle, table, success: true, inserted, total_fetched: rows.length, note, newest_feed_item: newestMs ? new Date(newestMs).toISOString() : null };

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
