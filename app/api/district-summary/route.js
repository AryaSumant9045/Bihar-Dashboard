/**
 * app/api/district-summary/route.js
 * --------------------------------------------------------
 * Reader for the per-district AI summary tables (district_summary_<slug>),
 * populated by /api/cron/district-insight.
 *
 * GET /api/district-summary?district=Patna          → latest AI summary
 * GET /api/district-summary?district=Ara&limit=5    → latest + history
 * GET /api/district-summary?district=all            → latest per district
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import { DISTRICT_SLUGS, districtSummaryTable, resolveDistrict, districtLabel } from '../../../lib/districts.js';

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

function isMissingTable(error) {
  return /42P01|PGRST205|Could not find the table|does not exist/i.test(`${error?.code || ''} ${error?.message || ''}`);
}

const NOT_READY = 'Is district ka AI analysis abhi taiyar nahi hai.';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const districtInput = searchParams.get('district') || 'all';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 5, 1), 30);

  const supabase = makeSupabase();
  if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    const entry = resolveDistrict(districtInput);

    /* ── Single district ──────────────────────────────────────── */
    if (entry) {
      const table = districtSummaryTable(entry.slug);
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (isMissingTable(error)) {
          return Response.json({
            district: entry.en, table, available: false, latest: null, items: [],
            message: `${NOT_READY} (table ${table} missing)`,
          });
        }
        return Response.json({ error: error.message }, { status: 500 });
      }

      const items = data || [];
      return Response.json({
        district: entry.en,
        table,
        available: items.length > 0,
        latest: items[0] || null,
        items,
        ...(items.length ? {} : { message: NOT_READY }),
      });
    }

    /* ── all → latest summary of every district ───────────────── */
    const results = await Promise.allSettled(
      DISTRICT_SLUGS.map(async (slug) => {
        const { data, error } = await supabase
          .from(districtSummaryTable(slug))
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
        if (error) return { slug, latest: null };
        return { slug, label: districtLabel(slug), latest: (data || [])[0] || null };
      })
    );

    const items = results
      .flatMap((r) => (r.status === 'fulfilled' && r.value.latest ? [r.value] : []))
      .sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at))
      .map((x) => ({ district: x.label || x.slug, latest: x.latest }));

    return Response.json({ district: 'all', available: items.length > 0, items, count: items.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
