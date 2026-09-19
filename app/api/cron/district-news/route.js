/**
 * app/api/cron/district-news/route.js
 * --------------------------------------------------------
 * Once-a-day pipeline (triggered by .github/workflows/district-news-daily.yml).
 * Live Hindustan ke state/district RSS feeds se har Bihar district ki latest
 * news (last 7 days) fetch karke public.district_news table me upsert karta
 * hai (url unique → duplicates skip).
 * Service-role access stays server-side only, same as /api/cron/news-pipeline.
 *
 * GET /api/cron/district-news            (all districts)
 * GET /api/cron/district-news?district=Patna
 * GET /api/cron/district-news?dry=1      (no DB write)
 * Security: ?secret=CRON_SECRET ya Authorization: Bearer CRON_SECRET
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

/* Service-role client: server-side only, so RLS-checked writes work.
   The anon client (getSupabase) only has SELECT on district_news. */
function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

/* { district: display name used across the UI, slug: Live Hindustan feed path } */
const DISTRICT_FEEDS = [
  { district: 'Bihar', slug: '' },
  { district: 'Patna', slug: 'patna' },
  { district: 'Bhagalpur', slug: 'bhagalpur' },
  { district: 'Muzaffarpur', slug: 'muzaffarpur' },
  { district: 'Ara', slug: 'ara' },
  { district: 'Begusarai', slug: 'begusarai' },
  { district: 'Biharsharif', slug: 'biharsharif' },
  { district: 'Buxar', slug: 'buxar' },
  { district: 'Chapra', slug: 'chapra' },
  { district: 'Gopalganj', slug: 'gopalganj' },
  { district: 'Hajipur', slug: 'hajipur' },
  { district: 'Jahanabad', slug: 'jahanabad' },
  { district: 'Siwan', slug: 'siwan' },
  { district: 'Gaya', slug: 'gaya' },
  { district: 'Aurangabad', slug: 'aurangabad' },
  { district: 'Bhabua', slug: 'bhabua' },
  { district: 'Nawada', slug: 'nawada' },
  { district: 'Sasaram', slug: 'sasaram' },
  { district: 'Banka', slug: 'banka' },
  { district: 'Araria', slug: 'araria' },
  { district: 'Katihar', slug: 'katihar' },
  { district: 'Khagaria', slug: 'khagaria' },
  { district: 'Kishanganj', slug: 'kishanganj' },
  { district: 'Madhepura', slug: 'madhepura' },
  { district: 'Munger', slug: 'munger' },
  { district: 'Purnia', slug: 'purnia' },
  { district: 'Saharsa', slug: 'saharsa' },
  { district: 'Lakhisarai', slug: 'lakhisarai' },
  { district: 'Jamui', slug: 'jamui' },
  { district: 'Supaul', slug: 'supaul' },
  { district: 'Darbhanga', slug: 'darbhanga' },
  { district: 'Madhubani', slug: 'madhubani' },
  { district: 'Bagaha', slug: 'bagaha' },
  { district: 'Bettiah', slug: 'bettiah' },
  { district: 'Motihari', slug: 'motihari' },
  { district: 'Samastipur', slug: 'samastipur' },
  { district: 'Sitamarhi', slug: 'sitamarhi' },
];

const MAX_AGE_DAYS = 7;
const MAX_PER_DISTRICT = 20;
const FEED_BASE = 'https://api.livehindustan.com/feeds/rss/bihar';

function decodeEntities(value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRe.exec(xml))) {
    const block = match[1];
    const grab = tag => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
      const m = block.match(r);
      return m ? decodeEntities(m[1].trim()) : '';
    };
    const image = block.match(/<media:content[^>]*url="([^"]+)"/);
    items.push({
      title: grab('title'),
      link: grab('link'),
      pubDate: grab('pubDate'),
      image: image ? image[1] : '',
    });
  }
  return items;
}

/* The CDN sometimes answers 200 with an empty body, so retry before giving up. */
async function fetchFeedXml(url) {
  let lastStatus = 'empty body';
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'User-Agent': 'BiharDashboardBot/1.0 (+https://bihar-dashboard-ojls.vercel.app)' },
    });
    if (!res.ok) {
      lastStatus = `HTTP ${res.status}`;
      continue;
    }
    const xml = await res.text();
    if (xml.includes('<item>')) return xml;
    lastStatus = xml.trim() ? 'no items in feed' : 'empty body';
  }
  throw new Error(`${url}: ${lastStatus}`);
}

async function fetchDistrictNews(entry) {
  const feedUrl = entry.slug
    ? `${FEED_BASE}/${entry.slug}/rssfeed.xml`
    : `${FEED_BASE}/rssfeed.xml`;
  const xml = await fetchFeedXml(feedUrl);
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  return parseRssItems(xml)
    .filter(item => item.title && item.link)
    .filter(item => {
      const ts = Date.parse(item.pubDate);
      return !isNaN(ts) && ts >= cutoff;
    })
    .slice(0, MAX_PER_DISTRICT)
    .map(item => ({
      district: entry.district,
      title: item.title,
      url: item.link,
      source: 'Live Hindustan',
      image_url: item.image || null,
      published_at: new Date(item.pubDate).toISOString(),
    }));
}

async function fetchInBatches(entries, size) {
  const rows = [];
  const errors = [];
  for (let i = 0; i < entries.length; i += size) {
    const chunk = entries.slice(i, i + size);
    const results = await Promise.allSettled(chunk.map(fetchDistrictNews));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') rows.push(...r.value);
      else errors.push(`${chunk[idx].district}: ${r.reason?.message || r.reason}`);
    });
  }
  return { rows, errors };
}

export async function GET(request) {
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

  const supabase = makeSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase service role not configured' }, { status: 500 });
  }

  const single = searchParams.get('district');
  const targets = single
    ? DISTRICT_FEEDS.filter(e => e.district.toLowerCase() === single.toLowerCase())
    : DISTRICT_FEEDS;

  if (!targets.length) {
    return Response.json({ error: `Unknown district: ${single}` }, { status: 400 });
  }

  console.log(`[Cron] district-news started for ${targets.length} district(s) at ${new Date().toISOString()}`);

  try {
    const { rows, errors } = await fetchInBatches(targets, 6);

    if (searchParams.get('dry') === '1') {
      return Response.json({ status: 'dry-run', districts: targets.length, fetched: rows.length, sample: rows.slice(0, 3), errors });
    }

    if (!rows.length) {
      return Response.json({ status: 'success', fetched: 0, errors, message: 'No fresh items in the last 7 days.' });
    }

    /* One article can appear in several district feeds; keep the first district only. */
    const seen = new Set();
    const unique = rows.filter(row => (seen.has(row.url) ? false : seen.add(row.url)));

    const { error, count } = await supabase
      .from('district_news')
      .upsert(unique, { onConflict: 'url', ignoreDuplicates: true, count: 'exact' });
    if (error) throw error;

    const { count: total } = await supabase
      .from('district_news')
      .select('id', { count: 'exact', head: true });

    console.log(`[Cron] district-news saved ${count ?? 0} new of ${unique.length} fetched; table total ${total}`);

    return Response.json({
      status: 'success',
      districts: targets.length,
      fetched: unique.length,
      new_saved: count ?? 0,
      table_total: total ?? null,
      errors,
    });
  } catch (err) {
    console.error('[Cron] district-news error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
