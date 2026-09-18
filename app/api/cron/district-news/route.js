/**
 * app/api/cron/district-news/route.js
 * --------------------------------------------------------
 * Once-a-day pipeline (triggered by .github/workflows/district-news-daily.yml).
 * Google News RSS se har Bihar district ki latest news (last 7 days) fetch
 * karke public.district_news table me upsert karta hai (url unique → duplicates skip).
 * Service-role access stays server-side only, same as /api/cron/news-pipeline.
 *
 * GET /api/cron/district-news            (all 38 districts)
 * GET /api/cron/district-news?district=Patna
 * Security: ?secret=CRON_SECRET ya Authorization: Bearer CRON_SECRET
 * ============================================================
 */

import { getSupabase } from '../../../../lib/supabase.js';

export const maxDuration = 60;

const DISTRICTS = [
  'Patna', 'Bhagalpur', 'Muzaffarpur', 'Ara', 'Begusarai', 'Biharsharif', 'Buxar',
  'Chapra', 'Gopalganj', 'Hajipur', 'Jahanabad', 'Siwan', 'Gaya', 'Aurangabad',
  'Bhabua', 'Nawada', 'Sasaram', 'Banka', 'Araria', 'Katihar', 'Khagaria',
  'Kishanganj', 'Madhepura', 'Munger', 'Purnia', 'Saharsa', 'Lakhisarai',
  'Jamui', 'Supaul', 'Darbhanga', 'Madhubani', 'Bagaha', 'Bettiah', 'Motihari',
  'Samastipur', 'Sitamarhi',
];

const MAX_AGE_DAYS = 7;
const MAX_PER_DISTRICT = 8;

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
    items.push({ title: grab('title'), link: grab('link'), pubDate: grab('pubDate'), source: grab('source') });
  }
  return items;
}

async function fetchDistrictNews(district) {
  const query = encodeURIComponent(`${district} Bihar`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${district}: RSS ${res.status}`);
  const xml = await res.text();
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  return parseRssItems(xml)
    .filter(item => item.title && item.link)
    .filter(item => {
      const ts = Date.parse(item.pubDate);
      return !isNaN(ts) && ts >= cutoff;
    })
    .slice(0, MAX_PER_DISTRICT)
    .map(item => ({
      district,
      title: item.title,
      url: item.link,
      source: item.source || 'Google News',
      published_at: new Date(item.pubDate).toISOString(),
    }));
}

async function fetchInBatches(districts, size) {
  const rows = [];
  const errors = [];
  for (let i = 0; i < districts.length; i += size) {
    const chunk = districts.slice(i, i + size);
    const results = await Promise.allSettled(chunk.map(fetchDistrictNews));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') rows.push(...r.value);
      else errors.push(`${chunk[idx]}: ${r.reason?.message || r.reason}`);
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

  const supabase = getSupabase();
  if (!supabase) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const single = searchParams.get('district');
  const targets = single ? [single] : DISTRICTS;

  console.log(`[Cron] district-news started for ${targets.length} district(s) at ${new Date().toISOString()}`);

  try {
    const { rows, errors } = await fetchInBatches(targets, 10);

    if (searchParams.get('dry') === '1') {
      return Response.json({ status: 'dry-run', districts: targets.length, fetched: rows.length, sample: rows.slice(0, 3), errors });
    }

    if (!rows.length) {
      return Response.json({ status: 'success', fetched: 0, errors, message: 'No fresh items in the last 7 days.' });
    }

    const { error, count } = await supabase
      .from('district_news')
      .upsert(rows, { onConflict: 'url', ignoreDuplicates: true, count: 'exact' });
    if (error) throw error;

    const { count: total } = await supabase
      .from('district_news')
      .select('id', { count: 'exact', head: true });

    console.log(`[Cron] district-news saved ${count ?? 0} new of ${rows.length} fetched; table total ${total}`);

    return Response.json({
      status: 'success',
      districts: targets.length,
      fetched: rows.length,
      new_saved: count ?? 0,
      table_total: total ?? null,
      errors,
    });
  } catch (err) {
    console.error('[Cron] district-news error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
