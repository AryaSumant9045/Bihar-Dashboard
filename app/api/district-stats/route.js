/**
 * app/api/district-stats/route.js
 * --------------------------------------------------------
 * Har district ki live volume stats — UI ke district buttons ko
 * "jitni news, utna upar + utna highlight" order me lagane ke liye.
 *
 * GET /api/district-stats
 *   → { generated_at, total_articles, districts: [
 *        { slug, feed, hi, en, articles, analysed, last_summary_at } ] }
 *
 * `articles` = district_news_<slug> me abhi kitni headlines hain
 * `analysed` = latest AI summary me kitni headlines process hui thi
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import { DISTRICTS, DISTRICTS_UNIQUE, districtNewsTable, districtSummaryTable } from '../../../lib/districts.js';

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

export async function GET() {
  const supabase = makeSupabase();
  if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    /* Counts ek hi baar per district slug (west_champaran do buttons me hai). */
    const perSlug = await Promise.allSettled(
      DISTRICTS_UNIQUE.map(async (d) => {
        const news = await supabase
          .from(districtNewsTable(d.slug))
          .select('id', { count: 'exact', head: true });
        const summary = await supabase
          .from(districtSummaryTable(d.slug))
          .select('created_at, news_count')
          .order('created_at', { ascending: false })
          .limit(1);
        return {
          slug: d.slug,
          articles: news.error ? 0 : news.count || 0,
          analysed: summary.error ? 0 : (summary.data?.[0]?.news_count || 0),
          last_summary_at: summary.error ? null : (summary.data?.[0]?.created_at || null),
        };
      })
    );

    const stats = new Map();
    perSlug.forEach((r) => {
      if (r.status === 'fulfilled') stats.set(r.value.slug, r.value);
    });

    /* UI buttons har label (Hindi/English/feed slug) se lookup kar sakti hain. */
    const districts = DISTRICTS.map((d) => {
      const s = stats.get(d.slug) || { articles: 0, analysed: 0, last_summary_at: null };
      return {
        slug: d.slug,
        feed: d.feed,
        hi: d.hi,
        en: d.en,
        articles: s.articles,
        analysed: s.analysed,
        last_summary_at: s.last_summary_at,
      };
    });

    const total = districts.reduce((sum, d) => sum + (d.feed ? d.articles : 0), 0);

    return Response.json(
      { generated_at: new Date().toISOString(), total_articles: total, districts },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900' } }
    );
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
