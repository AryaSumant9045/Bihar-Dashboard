/**
 * app/api/home/route.js
 * ------------------------------------------------------------
 * Aggregator for the President's Homepage — pulls live data for all
 * 6 priority cards + alert summary + top issues + district heatmap
 * from existing Supabase tables in ONE call (fast, single round-trip).
 *
 * GET /api/home   →  { top3, trending, activity, opposition, pk, issues,
 *                      alertSummary, districtActivity, updated_at }
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

const SEV_ORDER = { critical: 0, high: 1, developing: 1, medium: 2, watch: 2, routine: 3, low: 3 };

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [newsRes, oppSumRes, oppNewsRes, pkXRes, issuesRes] = await Promise.all([
      supabase.from('district_news').select('district, title, source, url, published_at')
        .order('published_at', { ascending: false }).limit(120),
      supabase.from('opposition_summary').select('*').order('created_at', { ascending: false }).limit(1),
      supabase.from('opposition_news').select('party, heading, district, url, published_at')
        .order('published_at', { ascending: false }).limit(60),
      supabase.from('xjansuraaj').select('heading, url, published_at')
        .order('published_at', { ascending: false }).limit(3),
      supabase.from('issues').select('id, title, category, priority, status, district, date')
        .order('created_at', { ascending: false }).limit(8),
    ]);

    const news = newsRes.data || [];
    const recent24 = news.filter(n => n.published_at >= last24h);

    /* Card 1 — 3 Things Requiring Attention (severity-ranked latest) */
    const top3 = [...news]
      .sort((a, b) => (SEV_ORDER[(b.severity || '').toLowerCase()] ?? 9) - (SEV_ORDER[(a.severity || '').toLowerCase()] ?? 9)
        || new Date(b.published_at) - new Date(a.published_at))
      .slice(0, 3);

    /* Card 2 — Trending (political keyword frequency in last 24h headlines) */
    const stop = new Set(['bihar', 'the', 'and', 'for', 'with', 'from', 'this', 'that', 'after', 'over', 'amid', 'says', 'said', 'new', 'news', 'today', 'weather', 'september', 'will', 'have', 'been', 'their', 'more', 'into', 'during']);
    const freq = {};
    recent24.forEach(n => {
      (n.title || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/)
        .filter(w => w.length > 3 && !stop.has(w)).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    });
    const trending = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([word, count]) => ({ word, count }));

    /* Card 3 — Where Activity Is Happening (district count last 24h) */
    const distCount = {};
    recent24.forEach(n => { const d = n.district || 'Multiple'; distCount[d] = (distCount[d] || 0) + 1; });
    const activity = Object.entries(distCount).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([district, count]) => ({ district, count }));

    /* Card 4 — Opposition Watch */
    const oppSum = (oppSumRes.data || [])[0] || null;
    let topAttack = null;
    if (oppSum && Array.isArray(oppSum.attacks_on_bjp)) {
      const sev = { high: 3, critical: 3, medium: 2, low: 1 };
      topAttack = [...oppSum.attacks_on_bjp].sort((a, b) =>
        (sev[(b.severity || '').toLowerCase()] || 0) - (sev[(a.severity || '').toLowerCase()] || 0))[0] || null;
    }
    const opposition = oppSum ? {
      overall: (oppSum.overall_situation || '').slice(0, 160),
      top_attack: topAttack,
      news_count: oppSum.news_count || 0,
      created_at: oppSum.created_at,
    } : null;

    /* Card 5 — PK Watch (latest Jan Suraaj X posts) */
    const pk = (pkXRes.data || []).map(p => ({
      heading: p.heading, url: p.url, published_at: p.published_at,
    }));

    /* Card 6 — Speech / Comms: count speech briefs if table exists, else null */
    let speechCount = null;
    const sp = await supabase.from('speech_briefs').select('id', { count: 'exact', head: true });
    if (!sp.error) speechCount = sp.count ?? 0;

    /* Right rail — top open issues */
    const issues = (issuesRes.data || []).filter(i => i.status !== 'resolved').slice(0, 6);

    /* Alert summary — count by recency (no severity column in district_news) */
    const now = Date.now();
    const alertSummary = {
      critical: recent24.filter(n => (now - new Date(n.published_at)) < 6 * 3600000).length,
      developing: recent24.filter(n => { const h = now - new Date(n.published_at); return h >= 6 * 3600000 && h < 12 * 3600000; }).length,
      watch: recent24.filter(n => { const h = now - new Date(n.published_at); return h >= 12 * 3600000 && h < 18 * 3600000; }).length,
      routine: recent24.filter(n => (now - new Date(n.published_at)) >= 18 * 3600000).length,
    };

    return Response.json({
      has_data: true,
      top3, trending, activity, opposition, pk, issues, alertSummary,
      speechCount,
      updated_at: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[home API] Error:', err.message);
    return Response.json({ has_data: false, error: err.message }, { status: 500 });
  }
}
