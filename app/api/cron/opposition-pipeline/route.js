/**
 * GET/POST /api/cron/opposition-pipeline
 * ============================================================
 * Opposition Live ingestion cron.
 * Part A: YouTube RSS (3 channels × 10 videos each)
 * Part B: RSS feeds (11 Google News + Bing RSS feeds, party-mapped)
 * Part C: AI summary via Gemini → Groq → PlugSky
 *
 * Add ?debug=1 to see per-feed errors in the response.
 * ============================================================
 */

import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';
import { callLLMWithFallback } from '../../../../lib/llm-providers.js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// ── Supabase (service role) ────────────────────────────────
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing');
  return createClient(url, key);
}

// ── YouTube Channel IDs (3 confirmed channels only) ────────
const YT_CHANNELS = [
  { channelId: 'UCC0bFdwsgiA-roI9M4DTKXw', channelName: 'Jan Suraaj Official', party: 'Jan Suraaj' },
  { channelId: 'UC-qeNGhgJkhWyJ5DGBZJF5w', channelName: 'INC Bihar',            party: 'INC' },
  { channelId: 'UC8fS2ekKQ5qYG4aWiAWEMlw', channelName: 'RJD Bihar',            party: 'RJD' },
];

// ── RSS Feed → Party mapping ────────────────────────────────
function getRssFeeds() {
  const e = process.env;
  return [
    { url: e.JAN_SURAAJ_NEWS_RSS,             party: 'Jan Suraaj',      sourceName: 'Jan Suraaj News' },
    { url: e.JAN_SURAAJ_PK_RSS,               party: 'Jan Suraaj',      sourceName: 'Jan Suraaj PK' },
    { url: e.JAN_SURAAJ_BIHAR_RSS,            party: 'Jan Suraaj',      sourceName: 'Jan Suraaj Bihar' },
    { url: e.BIHAR_CONGRESS_RSS,              party: 'INC',             sourceName: 'Bihar Congress' },
    { url: e.BIHAR_CONGRESS_LIVEHINDUSTAN_RSS, party: 'INC',            sourceName: 'Bihar Congress LH' },
    { url: e.RAHUL_GANDHI_BIHAR_RSS,          party: 'INC',             sourceName: 'Rahul Gandhi Bihar' },
    { url: e.BING_RAHUL_MODI_BIHAR_RSS,       party: 'INC',             sourceName: 'Bing Rahul/Modi Bihar' },
    { url: e.RJD_BIHAR_RSS,                   party: 'RJD',             sourceName: 'RJD Bihar' },
    { url: e.BING_RJD_TEJASHWI_RSS,           party: 'RJD',             sourceName: 'Bing RJD Tejashwi' },
    { url: e.RJD_PARTY_NEWS_RSS,              party: 'RJD',             sourceName: 'RJD Party News' },
    { url: e.TEJASHWI_YADAV_NEWS_RSS,         party: 'Tejashwi Yadav',  sourceName: 'Tejashwi Yadav News' },
  ].filter(f => f.url);
}

// ── Fetch with timeout helper ──────────────────────────────
async function fetchWithTimeout(url, opts = {}, ms = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// ── RSS parser with proper Google News headers ─────────────
const rssParser = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; Bihar-Dashboard/2.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: { item: ['media:thumbnail', 'media:content'] },
});

// ── Part A: YouTube ingestion (via YouTube RSS, no quota) ──
async function fetchYouTubeVideos(errors) {
  const results = [];
  await Promise.allSettled(
    YT_CHANNELS.map(async ({ channelId, channelName, party }) => {
      const ytRssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
      try {
        const res = await fetchWithTimeout(ytRssUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FeedBot/1.0)',
            'Accept': 'application/atom+xml, application/xml, */*',
          },
        }, 12000);

        if (!res.ok) {
          errors.push(`YT ${channelName}: HTTP ${res.status}`);
          return;
        }

        const xml = await res.text();
        const feed = await rssParser.parseString(xml);

        for (const item of (feed.items || []).slice(0, 10)) {
          const link = item.link || item.id || '';
          const videoId = link.match(/watch\?v=([^&]+)/)?.[1] ||
                          link.match(/v=([^&]+)/)?.[1] || null;
          const heading = (item.title || '').trim().slice(0, 500);
          if (!heading) continue;
          results.push({
            party,
            source_type:  'youtube',
            source_name:  channelName,
            heading,
            video_id:     videoId,
            url:          link || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null),
            published_at: item.isoDate || item.pubDate || null,
            district:     'General',
          });
        }
      } catch (err) {
        errors.push(`YT ${channelName}: ${err.message}`);
      }
    })
  );
  return results;
}

// ── Part B: RSS ingestion ─────────────────────────────────
async function fetchRssFeeds(errors) {
  const feeds = getRssFeeds();
  const results = [];

  await Promise.allSettled(
    feeds.map(async ({ url, party, sourceName }) => {
      try {
        // Fetch raw content first with proper headers (needed for Google News)
        const res = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FeedBot/1.0)',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'hi,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
        }, 12000);

        if (!res.ok) {
          errors.push(`RSS ${sourceName}: HTTP ${res.status}`);
          return;
        }

        const xml = await res.text();
        if (!xml || xml.length < 100) {
          errors.push(`RSS ${sourceName}: Empty response`);
          return;
        }

        const feed = await rssParser.parseString(xml);

        for (const item of (feed.items || []).slice(0, 15)) {
          const heading = (item.title || '').trim().slice(0, 500);
          if (!heading) continue;
          results.push({
            party,
            source_type:  'rss',
            source_name:  sourceName,
            heading,
            video_id:     null,
            url:          item.link || item.url || null,
            published_at: item.isoDate || item.pubDate || null,
            district:     'General',
          });
        }
      } catch (err) {
        errors.push(`RSS ${sourceName}: ${err.message}`);
      }
    })
  );
  return results;
}

// ── Opposition AI System Prompt ────────────────────────────
const OPPOSITION_SYSTEM_PROMPT = `आप BJP Bihar War Room के लिए एक Senior Political Intelligence Analyst AI हैं।

आपको Bihar के विपक्षी दलों (Jan Suraaj, INC, RJD, Tejashwi Yadav) की latest news headlines दी जाएंगी।
इनके आधार पर एक structured Opposition Intelligence Report तैयार करें।

## सख्त नियम
1. केवल valid JSON लौटाएं — कोई markdown, backtick या extra text नहीं
2. पहला character { होना चाहिए
3. सिर्फ दिए गए headlines के facts पर आधारित रहें
4. अगर data नहीं है तो empty array [] दें

## Output JSON Structure:
{
  "overall_situation": "3-4 line overview in Hindi",
  "party_wise_activity": [{"party":"...","activity_summary":"...","key_issues_raised":["..."]}],
  "attacks_on_bjp": [{"party":"...","attack_summary":"...","severity":"Critical/High/Medium/Low"}],
  "bjp_advantage_points": ["..."],
  "risk_to_bjp": [{"issue":"...","risk_level":"Critical/High/Medium/Low","reason":"..."}],
  "counter_strategy_points": ["3-5 points"]
}`;

// ── Part C: AI Summary ─────────────────────────────────────
async function generateOppositionSummary(supabase, errors) {
  // Fetch up to 300 latest news items from DB
  const { data: allHeadlines, error: fetchErr } = await supabase
    .from('opposition_news')
    .select('heading, party, source_name, published_at')
    .order('created_at', { ascending: false })
    .limit(300);

  if (fetchErr) {
    errors.push(`Summary fetch: ${fetchErr.message}`);
    return null;
  }
  if (!allHeadlines || allHeadlines.length === 0) return null;

  // Smart-pack: include as many headlines as fit within token budget
  // Reserve ~600 tokens for system prompt + JSON structure overhead
  const BUDGET = 7200; // out of MAX_INPUT_TOKENS 8000
  let usedChars = 0;
  const headlines = [];
  for (const h of allHeadlines) {
    const line = `${headlines.length + 1}. [${h.party}] ${h.heading}`;
    const lineChars = line.length + 1; // +1 for newline
    const lineTokens = Math.ceil(lineChars / 3.5);
    if (usedChars / 3.5 + lineTokens > BUDGET) break;
    headlines.push(h);
    usedChars += lineChars;
  }

  const userPrompt = `इन ${headlines.length} opposition headlines का विश्लेषण करें:\n\n` +
    headlines.map((h, i) => `${i + 1}. [${h.party}] ${h.heading}`).join('\n');

  let llmResult;
  try {
    llmResult = await callLLMWithFallback(OPPOSITION_SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    errors.push(`LLM: ${err.message}`);
    return null;
  }

  let parsed;
  try {
    let text = llmResult.content.trim();
    text = text.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim();
    
    try {
      parsed = JSON.parse(text);
    } catch (firstErr) {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end <= start) {
        throw new Error(`No JSON braces found. Output snippet: ${text.slice(0, 100)}`);
      }
      parsed = JSON.parse(text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
    }
  } catch (err) {
    errors.push(`JSON parse: ${err.message}`);
    return null;
  }

  const { error: saveErr } = await supabase.from('opposition_summary').insert({
    overall_situation:       parsed.overall_situation      || null,
    party_wise_activity:     parsed.party_wise_activity    || [],
    attacks_on_bjp:          parsed.attacks_on_bjp         || [],
    bjp_advantage_points:    parsed.bjp_advantage_points   || [],
    risk_to_bjp:             parsed.risk_to_bjp            || [],
    counter_strategy_points: parsed.counter_strategy_points || [],
    news_count:              headlines.length,
  });

  if (saveErr) {
    errors.push(`Summary save: ${saveErr.message}`);
    return null;
  }

  return { provider: llmResult.provider, model: llmResult.model, newsCount: headlines.length };
}

// ── Main Handler ───────────────────────────────────────────
async function handlePipeline(request) {
  const { searchParams } = new URL(request.url);
  const isDebug = searchParams.get('debug') === '1';

  // Auth
  const cronSecret = (process.env.CRON_SECRET || 'bihar-cron-secret-2026');
  const providedSecret = searchParams.get('secret') ||
    request.headers.get('authorization')?.replace('Bearer ', '');
  const isUpstash = !!request.headers.get('upstash-signature');

  if (cronSecret && !isUpstash && providedSecret !== cronSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[OppPipeline] Starting at', new Date().toISOString());
  const supabase = getServiceSupabase();
  const errors = [];  // collect all errors for debug output

  // Part A + B in parallel
  const [ytItems, rssItems] = await Promise.all([
    fetchYouTubeVideos(errors),
    fetchRssFeeds(errors),
  ]);

  console.log(`[OppPipeline] Fetched: ${ytItems.length} YT + ${rssItems.length} RSS`);
  if (errors.length) console.warn('[OppPipeline] Fetch errors:', errors);

  let ytInserted = 0;
  let rssInserted = 0;
  let dbError = null;

  // Upsert YouTube (dedup by video_id AND heading+party)
  if (ytItems.length > 0) {
    const videoIds = ytItems.map(i => i.video_id).filter(Boolean);
    const { data: existingVids } = await supabase
      .from('opposition_news').select('video_id').in('video_id', videoIds);
    const existingSet = new Set((existingVids || []).map(r => r.video_id));
    const newYt = ytItems.filter(item => !item.video_id || !existingSet.has(item.video_id));

    if (newYt.length > 0) {
      // Dedup YT items by heading+party in memory
      const uniqueYt = [];
      const seenYt = new Set();
      for (const item of newYt) {
        const key = `${item.party}|${item.heading}`;
        if (!seenYt.has(key)) {
          seenYt.add(key);
          uniqueYt.push(item);
        }
      }

      const { data: inserted, error } = await supabase
        .from('opposition_news')
        .upsert(uniqueYt, { onConflict: 'heading,party', ignoreDuplicates: true })
        .select('id');
      
      if (error) { errors.push(`YT DB insert: ${error.message}`); dbError = error.message; }
      else ytInserted = inserted?.length || 0;
    }
  }

  // Upsert RSS (dedup by heading+party UNIQUE constraint)
  if (rssItems.length > 0) {
    // Dedup in memory first to prevent batch constraint errors
    const uniqueRss = [];
    const seen = new Set();
    for (const item of rssItems) {
      const key = `${item.party}|${item.heading}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRss.push(item);
      }
    }

    const { data: inserted, error } = await supabase
      .from('opposition_news')
      .upsert(uniqueRss, { onConflict: 'heading,party', ignoreDuplicates: true })
      .select('id');
    if (error) { errors.push(`RSS DB upsert: ${error.message}`); dbError = error.message; }
    else rssInserted = inserted?.length || 0;
  }

  console.log(`[OppPipeline] Inserted: ${ytInserted} YT + ${rssInserted} RSS`);

  // Part C: AI Summary (only if we have data)
  const summaryResult = await generateOppositionSummary(supabase, errors);

  return Response.json({
    status:    'success',
    fetched:   { youtube: ytItems.length, rss: rssItems.length },
    inserted:  { youtube: ytInserted, rss: rssInserted },
    summary:   summaryResult
      ? { generated: true, provider: summaryResult.provider, newsCount: summaryResult.newsCount }
      : { generated: false },
    timestamp: new Date().toISOString(),
    // Only show errors if ?debug=1 is passed (avoid leaking info in production)
    ...(isDebug ? { errors, dbError } : {}),
  });
}

export async function GET(request) {
  try { return await handlePipeline(request); }
  catch (err) {
    console.error('[OppPipeline] Fatal:', err);
    return Response.json({ error: err.message, stack: err.stack?.slice(0, 500) }, { status: 500 });
  }
}

export async function POST(request) {
  try { return await handlePipeline(request); }
  catch (err) {
    console.error('[OppPipeline] Fatal:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
