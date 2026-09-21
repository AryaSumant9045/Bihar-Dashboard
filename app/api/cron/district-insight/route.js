/**
 * app/api/cron/district-insight/route.js
 * --------------------------------------------------------
 * Per-district AI summary pipeline.
 *
 * Har district ke liye:
 *   1. district_news_<slug> se pichhle 24 ghante ki headlines nikaalo (max 60)
 *   2. Koi news nahi → SKIP (khali summary nahi banti, naya row nahi banta)
 *   3. Gemini (rate-limit par Groq fallback) se district-specific prompt chalao
 *   4. Result usi district ki district_summary_<slug> table me insert karo
 *   5. Agle district se pehle 1.5s gap + 6 districts ke batch
 *
 * GET /api/cron/district-insight                      (default batch: 6 districts)
 * GET /api/cron/district-insight?district=Patna       (single district)
 * GET /api/cron/district-insight?batch=8&offset=8
 * GET /api/cron/district-insight?hours=24&force=1     (ignore the 24h window)
 * GET /api/cron/district-insight?dry=1                (LLM chalao, DB write nahi)
 * Security: ?secret=*** ya Authorization: Bearer ***
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import { DISTRICTS, DISTRICT_SLUGS, districtNewsTable, districtSummaryTable } from '../../../../lib/districts.js';
import { callLLMQuick, geminiState } from '../../../../lib/llm-providers.js';

export const maxDuration = 60;

const DEFAULT_BATCH = 6;
const MAX_HEADLINES = 60;
const DEFAULT_HOURS = 24;
const DISTRICT_GAP_MS = 1500;
/* Groq free tier par fast + available model. .env ka GROQ_MODEL (bada model)
   yahan inherit nahi hota — district pipeline apna halka model use karta hai. */
const DISTRICT_LLM_MODEL = process.env.DISTRICT_LLM_MODEL || 'openai/gpt-oss-20b';
const DISTRICT_LLM_RETRIES = Number(process.env.DISTRICT_LLM_RETRIES) || 3;
const MAX_HEADLINE_CHARS = 200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

function isMissingTable(error) {
  return /42P01|PGRST205|Could not find the table|does not exist/i.test(`${error?.code || ''} ${error?.message || ''}`);
}

/** Unique district entries (west_champaran appears once). */
const UNIQUE_DISTRICTS = DISTRICT_SLUGS.map((slug) => DISTRICTS.find((d) => d.slug === slug));

/** District-specific analyst prompt — district ka naam dynamically insert hota hai. */
function buildSystemPrompt(districtName) {
  return `आप BJP Bihar War Room के लिए ${districtName} District के Political Analyst हैं।
आपको सिर्फ इसी district की आज की headlines दी गई हैं।

नियम:
- सिर्फ दी गई headlines के facts पर आधारित रहें, speculation न करें
- अगर कोई political angle नहीं है, "इस district में आज कोई उल्लेखनीय राजनीतिक गतिविधि नहीं मिली" लिखें
- Neutral, factual भाषा रखें
- Output JSON

Output (केवल valid JSON, कोई markdown/backtick नहीं):
{
  "overall_situation": "2-3 lines",
  "key_developments": ["2-4 bullet points"],
  "political_risks": [{"issue": "...", "risk_level": "Critical/High/Medium/Low", "reason": "..."}],
  "bjp_activity": ["is district me BJP/sarkar ki activity"],
  "opposition_activity": ["is district me opposition ki activity"]
}

केवल valid JSON दें।`;
}

function buildUserPrompt(districtLabel, headlines) {
  const lines = headlines
    .map((h, i) => `${i + 1}. ${String(h.heading || '').slice(0, MAX_HEADLINE_CHARS)}`)
    .join('\n');
  return `District: ${districtLabel}
आज की headlines (${headlines.length}):

${lines}

ऊपर की headlines के आधार पर इस district का political intelligence JSON बनाएं।`;
}

function parseJson(text) {
  const start = String(text).indexOf('{');
  const end = String(text).lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in LLM response');
  return JSON.parse(String(text).slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

/** Headlines for one district: last `hours` (published_at OR created_at). */
async function loadHeadlines(supabase, slug, hours, force) {
  const table = districtNewsTable(slug);
  let query = supabase.from(table).select('heading, url, published_at, created_at');
  if (!force) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    query = query.or(`published_at.gte.${since},created_at.gte.${since}`);
  }
  const { data, error } = await query
    .order('published_at', { ascending: false })
    .limit(MAX_HEADLINES);
  if (error) throw error;
  return data || [];
}

async function processDistrict(supabase, entry, { hours, force, dry }) {
  const label = entry.en;
  const summaryTable = districtSummaryTable(entry.slug);

  let headlines = [];
  let windowUsed = `${hours}h`;
  try {
    headlines = await loadHeadlines(supabase, entry.slug, hours, force);
    /* Window me kuch nahi mila to us district ki latest saved headlines se
       summary bana dete hain — "kuch bhi analysis nahi hui" wali sthiti na aaye.
       (Skip sirf tab jab district ki table me ek bhi news na ho.) */
    if (!headlines.length && !force) {
      headlines = await loadHeadlines(supabase, entry.slug, hours, true);
      if (headlines.length) windowUsed = 'latest-available';
    }
  } catch (error) {
    return { district: label, table: summaryTable, status: isMissingTable(error) ? 'missing_news_table' : 'error', error: error.message };
  }

  /* Rule: news hi nahi hai → skip, khali summary mat banao. */
  if (!headlines.length) {
    return { district: label, table: summaryTable, status: 'skipped_no_news', news_count: 0 };
  }

  /* Groq-first + retries: Gemini ka free tier (20 req/day) poore dashboard me
     shared hai, isliye district pipeline usse wait nahi karta. */
  const systemPrompt = buildSystemPrompt(label);
  const userPrompt = buildUserPrompt(label, headlines);
  let llm;
  try {
    llm = await callLLMQuick(systemPrompt, userPrompt, { prefer: 'groq', model: DISTRICT_LLM_MODEL, retries: DISTRICT_LLM_RETRIES });
  } catch (firstError) {
    /* ek aur poori koshish — rate-limit bursts ke liye safety net */
    try {
      await sleep(2500);
      llm = await callLLMQuick(systemPrompt, userPrompt, { prefer: 'groq', model: DISTRICT_LLM_MODEL, retries: 2 });
    } catch (error) {
      return { district: label, table: summaryTable, status: 'llm_failed', news_count: headlines.length, error: error.message.slice(0, 300), model: DISTRICT_LLM_MODEL };
    }
  }

  let inference;
  try {
    inference = parseJson(llm.content);
  } catch (error) {
    return { district: label, table: summaryTable, status: 'parse_failed', news_count: headlines.length, error: error.message };
  }

  const row = {
    overall_situation: inference.overall_situation || null,
    key_developments: asArray(inference.key_developments),
    political_risks: asArray(inference.political_risks),
    bjp_activity: asArray(inference.bjp_activity),
    opposition_activity: asArray(inference.opposition_activity),
    news_count: headlines.length,
  };

  if (dry) {
    return { district: label, table: summaryTable, status: 'dry-run', news_count: headlines.length, provider: llm.provider, model: llm.model, window: windowUsed, row };
  }

  const { error } = await supabase.from(summaryTable).insert(row);
  if (error) {
    return {
      district: label, table: summaryTable, status: isMissingTable(error) ? 'missing_summary_table' : 'insert_failed',
      news_count: headlines.length, error: error.message,
    };
  }

  return { district: label, table: summaryTable, status: 'saved', news_count: headlines.length, provider: llm.provider, model: llm.model, window: windowUsed };
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

  const hours = Math.min(Math.max(parseInt(searchParams.get('hours'), 10) || DEFAULT_HOURS, 1), 168);
  const batch = Math.min(Math.max(parseInt(searchParams.get('batch'), 10) || DEFAULT_BATCH, 1), 12);
  const offset = Math.max(parseInt(searchParams.get('offset'), 10) || 0, 0);
  const force = searchParams.get('force') === '1';
  const dry = searchParams.get('dry') === '1';

  const single = searchParams.get('district');
  let targets;
  if (single && !['all', 'bihar', 'state'].includes(single.trim().toLowerCase())) {
    const needle = single.trim().toLowerCase();
    targets = UNIQUE_DISTRICTS.filter((d) =>
      [d.slug, d.en, d.hi, d.feed, ...(d.aliases || [])].some((v) => String(v).toLowerCase() === needle)
    );
    if (!targets.length) return Response.json({ error: `Unknown district: ${single}` }, { status: 400 });
  } else {
    targets = UNIQUE_DISTRICTS.slice(offset, offset + batch);
  }

  console.log(`[Cron] district-insight: ${targets.length} district(s), hours=${hours}, force=${force}, dry=${dry}`);

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    if (i > 0) await sleep(DISTRICT_GAP_MS); // rate-limit safety between districts
    try {
      results.push(await processDistrict(supabase, targets[i], { hours, force, dry }));
    } catch (error) {
      results.push({ district: targets[i].en, status: 'error', error: error.message });
    }
  }

  const saved = results.filter((r) => r.status === 'saved').length;
  const skipped = results.filter((r) => r.status === 'skipped_no_news').length;

  return Response.json({
    status: 'success',
    llm: { ...geminiState(), district_model: DISTRICT_LLM_MODEL },
    processed: results.length,
    saved,
    skipped_no_news: skipped,
    cells: results,
    next_offset: offset + targets.length < UNIQUE_DISTRICTS.length ? offset + targets.length : null,
  });
}
