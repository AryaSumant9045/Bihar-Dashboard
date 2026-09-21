/**
 * app/api/cron/district-news/route.js
 * --------------------------------------------------------
 * District-wise RSS ingestion — Live Hindustan feeds se data fetch karke
 * HAR DISTRICT KI APNI table me likhta hai:
 *
 *     patna/rssfeed.xml    → district_news_patna
 *     ara/rssfeed.xml      → district_news_bhojpur            (Ara = Bhojpur HQ)
 *     bagaha/bettiah/...   → district_news_west_champaran
 *     motihari/rssfeed.xml → district_news_east_champaran
 *     bihar/rssfeed.xml    → shared public.district_news (district='Bihar', state level)
 *
 * THIN-DISTRICT FALLBACK
 *   Kai district feeds bahut kam items dete hain (ya ekdum khaali) — jaise
 *   Vaishali/Hajipur, Banka, Katihar, Madhubani. Aur 4 districts (Arwal, Nalanda,
 *   Sheikhpura, Sheohar) ka Live Hindustan feed hi nahi hai. Aise districts ke
 *   liye is run me fetch kiye gaye SAARE items (state + baaki district feeds) me
 *   district ke naam/HQ keyword se cross-mention dhoondh kar uski table bhari
 *   jati hai — taki War Room me "kuch bhi nahi" wali sthiti na aaye.
 *
 * Dedup: url level (per table) — pehle existing urls nikalte hain, phir insert.
 * Service-role access stays server-side only.
 *
 * GET /api/cron/district-news                    (all districts + state)
 * GET /api/cron/district-news?district=Patna     (feed label / slug / Hindi naam)
 * GET /api/cron/district-news?district=bihar     (state feed only)
 * GET /api/cron/district-news?days=7&limit=60&fallback=0
 * GET /api/cron/district-news?dry=1              (no DB write)
 * Security: ?secret=*** ya Authorization: Bearer ***
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import {
  LIVEHINDUSTAN_FEEDS, DISTRICTS, DISTRICT_SLUGS,
  districtNewsTable, districtLabel, districtFallbackKeywords, districtQueryName,
} from '../../../../lib/districts.js';

export const maxDuration = 60;

/* Service-role client: server-side only, so RLS-checked writes work. */
function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

const STATE_TABLE = 'district_news';
const DEFAULT_DAYS = 7;
const DEFAULT_PER_DISTRICT = 60;
const FEED_BASE = 'https://api.livehindustan.com/feeds/rss/bihar';

/* Fallback: agar kisi district ki apni feed se MIN_FRESH se kam items aaye,
   to cross-mention items se uski table FALLBACK_CAP tak bhar di jati hai. */
const MIN_FRESH = 3;
const FALLBACK_CAP = 20;

/* Kai district feeds (hajipur, banka, katihar…) ki newest khabar hi 7 din se
   purani hoti hai — aise districts khaali na reh jayein, isliye pehle `days`
   window, aur kuch na mile to WIDE_DAYS tak dekha jata hai. */
const WIDE_DAYS = 30;
const WIDE_TAKE = 20;

/* Teen districts (Arwal, Sheikhpura, Sheohar) ka Live Hindustan feed hi nahi hai,
   aur kai feeds bahut patle hain — unke liye Google News RSS supplemental source. */
const GOOGLE_TAKE = 15;
const GOOGLE_MIN = 3;
const GOOGLE_BATCH = 5;

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
    const grab = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
      const m = block.match(r);
      return m ? decodeEntities(m[1].trim()) : '';
    };
    items.push({ title: grab('title'), link: grab('link'), pubDate: grab('pubDate') });
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
    if (!res.ok) { lastStatus = `HTTP ${res.status}`; continue; }
    const xml = await res.text();
    if (xml.includes('<item>')) return xml;
    lastStatus = xml.trim() ? 'no items in feed' : 'empty body';
  }
  throw new Error(`${url}: ${lastStatus}`);
}

/** Rows shaped for the target table (district tables vs legacy state table). */
function toRows(fresh, isState) {
  return isState
    ? fresh.map((item) => ({
        district: 'Bihar',
        title: item.title,
        url: item.link,
        source: 'Live Hindustan',
        published_at: new Date(item.pubDate).toISOString(),
      }))
    : fresh.map((item) => ({
        heading: item.title,
        url: item.link,
        published_at: new Date(item.pubDate).toISOString(),
      }));
}

/**
 * Fetch one feed. `allItems` me har item (source feed ke saath) jama hota hai,
 * taki baad me thin districts ke liye cross-mention fallback chala sake.
 */
async function fetchDistrictNews(entry, { days, perDistrict, allItems }) {
  const feedUrl = entry.feed ? `${FEED_BASE}/${entry.feed}/rssfeed.xml` : `${FEED_BASE}/rssfeed.xml`;
  const xml = await fetchFeedXml(feedUrl);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const isState = !entry.feed;

  const parsed = parseRssItems(xml).filter((item) => item.title && item.link);
  const newerThan = (list, d) => {
    const limit = Date.now() - d * 24 * 60 * 60 * 1000;
    return list.filter((item) => {
      const ts = Date.parse(item.pubDate);
      return !isNaN(ts) && ts >= limit;
    });
  };

  /* Tier 1: normal window. Tier 2: agar kuch nahi mila to wide window
     (us district ki jo bhi latest available news hai wo le lo). */
  let fresh = newerThan(parsed, days).slice(0, perDistrict);
  let windowUsed = `${days}d`;
  if (!fresh.length) {
    fresh = newerThan(parsed, WIDE_DAYS).slice(0, Math.min(perDistrict, WIDE_TAKE));
    if (fresh.length) windowUsed = `${WIDE_DAYS}d`;
  }

  if (allItems) {
    for (const item of fresh) {
      allItems.push({ sourceSlug: entry.slug || 'state', title: item.title, link: item.link, pubDate: item.pubDate });
    }
  }

  return {
    table: isState ? STATE_TABLE : districtNewsTable(entry.slug),
    slug: entry.slug,
    isState,
    rows: toRows(fresh, isState),
    freshCount: fresh.length,
    windowUsed,
  };
}

async function fetchInBatches(entries, size, opts) {
  const groups = new Map();   // table → rows[]
  const counts = new Map();   // slug → fresh count
  const errors = [];
  const allItems = [];
  const wideWindow = [];      // districts that needed the 30-day window

  for (let i = 0; i < entries.length; i += size) {
    const chunk = entries.slice(i, i + size);
    const results = await Promise.allSettled(chunk.map((entry) => fetchDistrictNews(entry, { ...opts, allItems })));
    results.forEach((r, idx) => {
      const entry = chunk[idx];
      if (r.status !== 'fulfilled') {
        errors.push(`${entry.feed || 'state'}: ${r.reason?.message || r.reason}`);
        return;
      }
      const { table, slug, rows, freshCount } = r.value;
      if (slug) counts.set(slug, (counts.get(slug) || 0) + freshCount);
      if (slug && r.value.windowUsed !== `${opts.days}d`) wideWindow.push(slug);
      if (!rows.length) return;
      const merged = groups.get(table) || [];
      merged.push(...rows);
      groups.set(table, merged);
    });
  }
  return { groups, counts, errors, allItems, wideWindow };
}

/**
 * Thin districts ke liye cross-mention top-up: is run me mile saare items
 * (state + district feeds) me district ke keyword dhoondh kar us district ki
 * table me daal dete hain.
 */
function addFallbackRows(groups, counts, allItems, perDistrict) {
  const filled = [];
  for (const slug of DISTRICT_SLUGS) {
    const have = counts.get(slug) || 0;
    if (have >= MIN_FRESH) continue;

    const keywords = districtFallbackKeywords(slug);
    if (!keywords.length) continue;
    const needles = keywords.map((k) => k.toLowerCase());
    const table = districtNewsTable(slug);
    const already = new Set((groups.get(table) || []).map((r) => r.url));

    const extra = [];
    for (const item of allItems) {
      if (extra.length + have >= FALLBACK_CAP) break;
      if (already.has(item.link)) continue;
      const hay = String(item.title).toLowerCase();
      if (!needles.some((n) => hay.includes(n))) continue;
      already.add(item.link);
      extra.push({ heading: item.title, url: item.link, published_at: new Date(item.pubDate).toISOString() });
    }

    if (extra.length) {
      const merged = groups.get(table) || [];
      merged.push(...extra);
      groups.set(table, merged);
      filled.push({ district: districtLabel(slug), table, added: extra.length, own_feed: have });
    }
  }
  return filled;
}


/** Google News RSS — district-specific query (Hindi naam + बिहार). */
async function fetchGoogleNews(slug) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${districtQueryName(slug)} बिहार`)}&hl=hi-IN&gl=IN&ceid=IN:hi`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiharDashboardBot/1.0)' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`google-news HTTP ${res.status}`);
  return parseRssItems(await res.text()).filter((i) => i.title && i.link);
}

function safeIso(pubDate) {
  const ts = Date.parse(pubDate);
  return new Date(isNaN(ts) ? Date.now() : ts).toISOString();
}

/**
 * Thin districts (jinki apni table MIN_FRESH se kam bhari) ke liye Google News
 * RSS se top-up. District naam wale headlines pehle, phir baaki.
 */
async function addGoogleFallback(groups, thinSlugs) {
  const filled = [];
  for (let i = 0; i < thinSlugs.length; i += GOOGLE_BATCH) {
    const chunk = thinSlugs.slice(i, i + GOOGLE_BATCH);
    const results = await Promise.allSettled(chunk.map((slug) => fetchGoogleNews(slug)));
    results.forEach((r, idx) => {
      const slug = chunk[idx];
      if (r.status !== 'fulfilled') return;
      const needles = districtFallbackKeywords(slug).map((k) => k.toLowerCase());
      const hit = [];
      const rest = [];
      for (const item of r.value) {
        const hay = String(item.title).toLowerCase();
        (needles.some((n) => hay.includes(n)) ? hit : rest).push(item);
      }
      const picked = [...hit, ...rest].slice(0, GOOGLE_TAKE);
      const table = districtNewsTable(slug);
      const existing = new Set((groups.get(table) || []).map((x) => x.url));
      const rows = picked
        .filter((item) => !existing.has(item.link))
        .map((item) => ({ heading: item.title, url: item.link, published_at: safeIso(item.pubDate) }));
      if (!rows.length) return;
      const merged = groups.get(table) || [];
      merged.push(...rows);
      groups.set(table, merged);
      filled.push({ district: districtLabel(slug), table, added: rows.length, name_matched: hit.length });
    });
  }
  return filled;
}

function isMissingTable(error) {
  return /42P01|PGRST205|Could not find the table|does not exist/i.test(`${error?.code || ''} ${error?.message || ''}`);
}

/**
 * Save one table's rows.
 * NOTE: district tables par url UNIQUE constraint nahi hai (legacy shared table
 * par hai), isliye ON CONFLICT available nahi — dedup code me karte hain.
 */
async function saveTable(supabase, table, rows) {
  const unique = [...new Map(rows.map((r) => [r.url, r])).values()];

  /* Fast path: table par url UNIQUE hai (migration 016 ke baad) →
     ek hi upsert me dedup. Warna select+insert fallback (patch se pehle wale tables). */
  try {
    const { data, error, count } = await supabase
      .from(table)
      .upsert(unique, { onConflict: 'url', ignoreDuplicates: true, count: 'exact' });
    if (error) throw error;
    const saved = count ?? (data ? data.length : 0);
    return { table, fetched: unique.length, saved, ok: true, mode: 'upsert' };
  } catch (error) {
    if (!/42P10|no unique or exclusion constraint/i.test(`${error?.code || ''} ${error?.message || ''}`)) {
      return { table, fetched: unique.length, saved: 0, ok: false, missing_table: isMissingTable(error), error: error.message };
    }
  }

  const existing = new Set();
  try {
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100).map((r) => r.url);
      const { data, error } = await supabase.from(table).select('url').in('url', chunk);
      if (error) throw error;
      (data || []).forEach((r) => existing.add(r.url));
    }
  } catch (error) {
    return { table, fetched: unique.length, saved: 0, ok: false, missing_table: isMissingTable(error), error: error.message };
  }

  const fresh = unique.filter((r) => !existing.has(r.url));
  if (!fresh.length) return { table, fetched: unique.length, saved: 0, duplicates: unique.length, ok: true };

  try {
    const { data, error } = await supabase.from(table).insert(fresh).select('id');
    if (error) throw error;
    return { table, fetched: unique.length, saved: (data || []).length, duplicates: unique.length - fresh.length, ok: true, mode: 'select-insert' };
  } catch (error) {
    return { table, fetched: unique.length, saved: 0, ok: false, missing_table: isMissingTable(error), error: error.message };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = (process.env.CRON_SECRET || 'bihar-cron-secret-2026');
  if (secret) {
    const provided =
      searchParams.get('secret') ||
      request.headers.get('authorization')?.replace('Bearer ', '');
    if (provided !== secret) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = makeSupabase();
  if (!supabase) return Response.json({ error: 'Supabase service role not configured' }, { status: 500 });

  const single = searchParams.get('district');
  const days = Math.min(Math.max(parseInt(searchParams.get('days'), 10) || DEFAULT_DAYS, 1), 30);
  const perDistrict = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || DEFAULT_PER_DISTRICT, 1), 120);
  const useFallback = searchParams.get('fallback') !== '0';
  const useGoogle = searchParams.get('google') !== '0';

  let targets;
  let stateOnly = false;
  if (single) {
    const needle = single.trim().toLowerCase();
    targets = LIVEHINDUSTAN_FEEDS.filter((d) =>
      [d.slug, d.en, d.hi, d.feed, ...(d.aliases || [])].some((v) => String(v).toLowerCase() === needle)
    );
    if (needle === 'all') targets = LIVEHINDUSTAN_FEEDS;
    if (needle === 'bihar' || needle === 'state') { targets = LIVEHINDUSTAN_FEEDS; stateOnly = true; }
  } else {
    targets = LIVEHINDUSTAN_FEEDS;
  }

  if (single && !targets.length) {
    return Response.json({ error: `Unknown district: ${single}` }, { status: 400 });
  }

  console.log(`[Cron] district-news: ${targets.length} feed(s), days=${days}, perDistrict=${perDistrict}, fallback=${useFallback}`);

  try {
    const stateEntry = { slug: null, feed: null };
    const entries = stateOnly ? [stateEntry] : (single ? targets : [stateEntry, ...targets]);

    const { groups, counts, errors, allItems, wideWindow } = await fetchInBatches(entries, 6, { days, perDistrict });
    const fallbackFilled = useFallback && !stateOnly ? addFallbackRows(groups, counts, allItems, perDistrict) : [];

    /* Google News top-up: sirf un districts ke liye jinki table abhi bhi patli hai. */
    let googleFilled = [];
    if (useGoogle && !stateOnly) {
      const thinSlugs = DISTRICT_SLUGS.filter((slug) => (groups.get(districtNewsTable(slug)) || []).length < GOOGLE_MIN);
      if (thinSlugs.length) googleFilled = await addGoogleFallback(groups, thinSlugs);
    }

    if (searchParams.get('dry') === '1') {
      return Response.json({
        status: 'dry-run',
        districts_requested: targets.length,
        items_seen: allItems.length,
        tables: [...groups.entries()].map(([table, rows]) => ({ table, rows: rows.length, sample: rows.slice(0, 1) })),
        fallback_filled: fallbackFilled,
        google_filled: googleFilled,
        errors,
      });
    }

    if (!groups.size) {
      return Response.json({ status: 'success', fetched: 0, errors, message: `No fresh items in the last ${days} days.` });
    }

    const results = [];
    for (const [table, rows] of groups.entries()) {
      results.push(await saveTable(supabase, table, rows));
    }

    const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
    const missing = results.filter((r) => !r.ok).map((r) => ({ table: r.table, missing_table: r.missing_table, error: r.error }));

    console.log(`[Cron] district-news saved ${totalSaved} new row(s) across ${results.length} table(s); fallback filled ${fallbackFilled.length} district(s)`);

    return Response.json({
      status: missing.length ? 'partial' : 'success',
      districts_requested: targets.length,
      items_seen: allItems.length,
      tables_written: results.length,
      new_saved: totalSaved,
      fallback_filled: fallbackFilled,
      google_filled: googleFilled,
      wide_window_districts: wideWindow,
      per_table: results.map((r) => ({ table: r.table, fetched: r.fetched, saved: r.saved, mode: r.mode })),
      table_errors: missing,
      feed_errors: errors,
    });
  } catch (err) {
    console.error('[Cron] district-news error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
