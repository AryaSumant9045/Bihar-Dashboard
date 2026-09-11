/**
 * GET /api/debug
 * Shows status of all API keys + DB table counts.
 * Use this to diagnose issues.
 */
import { getSupabase } from '../../../lib/supabase';

export async function GET() {
  const results = {};

  // ── 1. Supabase DB counts ──────────────────────────────────
  const supabase = getSupabase();
  if (supabase) {
    const [raw, analyzed, alertsRes, districtRes, entitiesRes] = await Promise.all([
      supabase.from('raw_items').select('id, gemini_processed', { count: 'exact' }),
      supabase.from('analyzed_items').select('id', { count: 'exact' }),
      supabase.from('alerts').select('id, is_read', { count: 'exact' }),
      supabase.from('districts').select('id', { count: 'exact' }),
      supabase.from('entities').select('id', { count: 'exact' }),
    ]);

    const rawItems = raw.data || [];
    const alertItems = alertsRes.data || [];

    results.database = {
      connected: true,
      tables: {
        raw_items: {
          total:       rawItems.length,
          processed:   rawItems.filter(r => r.gemini_processed).length,
          unprocessed: rawItems.filter(r => !r.gemini_processed).length,
        },
        analyzed_items: { total: (analyzed.data || []).length },
        alerts: {
          total:  alertItems.length,
          unread: alertItems.filter(a => !a.is_read).length,
        },
        districts: { total: (districtRes.data || []).length },
        entities:  { total: (entitiesRes.data || []).length },
      },
    };
  } else {
    results.database = { connected: false, error: 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY' };
  }

  // ── 2. NewsData API key check ──────────────────────────────
  const newsKey = process.env.NEWS_DATA_API_KEY;
  if (newsKey) {
    try {
      const r = await fetch(
        `https://newsdata.io/api/1/news?apikey=${newsKey}&q=Bihar&language=en&country=in&size=1`,
        { cache: 'no-store' }
      );
      const body = await r.json();
      results.newsdata_api = { configured: true, status: r.status, ok: r.ok, message: body.status || body.message };
    } catch (e) {
      results.newsdata_api = { configured: true, ok: false, error: e.message };
    }
  } else {
    results.newsdata_api = { configured: false };
  }

  // ── 3. YouTube API key check ───────────────────────────────
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (ytKey) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?key=${ytKey}&part=id&id=dQw4w9WgXcQ`,
        { cache: 'no-store' }
      );
      results.youtube_api = { configured: true, status: r.status, ok: r.ok };
    } catch (e) {
      results.youtube_api = { configured: true, ok: false, error: e.message };
    }
  } else {
    results.youtube_api = { configured: false };
  }

  // ── 4. Gemini API key check ────────────────────────────────
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Reply with just the word: OK' }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
          cache: 'no-store',
        }
      );
      const body = await r.json();
      const reply = body.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      results.gemini_api = { configured: true, status: r.status, ok: r.ok, reply };
    } catch (e) {
      results.gemini_api = { configured: true, ok: false, error: e.message };
    }
  } else {
    results.gemini_api = { configured: false };
  }

  // ── 5. Supabase env check ──────────────────────────────────
  results.env = {
    SUPABASE_URL:    !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_KEY:    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEWS_DATA_KEY:   !!process.env.NEWS_DATA_API_KEY,
    YOUTUBE_KEY:     !!process.env.YOUTUBE_API_KEY,
    GEMINI_KEY:      !!process.env.GEMINI_API_KEY,
  };

  results.timestamp = new Date().toISOString();

  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
