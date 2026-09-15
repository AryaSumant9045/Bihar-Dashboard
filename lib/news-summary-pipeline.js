/**
 * lib/news-summary-pipeline.js - Core Logic for Batch Processing
 * --------------------------------------------------------
 * Is file mein asli logic likha hai jo news ko chote-chote batches (hisson) mein
 * fetch karta hai aur AI (LLM) se summarize karwata hai. Yeh cron pipeline ki madad karta hai.
 * --------------------------------------------------------
 * lib/news-summary-pipeline.js
 * ============================================================
 * Stateful batch-by-batch pipeline — designed for 30s cron limits.
 *
 * Each cron call does EXACTLY ONE of these things and returns fast:
 *
 *   Phase A — FETCH  : First call in a session window
 *             Fetch all news sources → save to raw_items → return
 *             (No LLM call, just fast HTTP + DB writes, ~10-20s)
 *
 *   Phase B — PROCESS: Subsequent calls while session is active
 *             Pick next 50 unprocessed items → call LLM → save summary
 *             (~10-20s total, well within 30s)
 *
 *   Phase C — DONE   : No unprocessed items left → mark session complete
 *
 * The cron-job.org job runs every 15 minutes all day.
 * Session windows (IST) decide when a NEW session starts:
 *   Morning : 6:30 AM – 9:00 AM
 *   Noon    : 12:00 PM – 3:00 PM
 *   Evening : 7:30 PM – 10:00 PM
 * ============================================================
 */

import Parser from 'rss-parser';
import { getSupabase } from './supabase.js';
import {
  callLLMWithFallback,
  TOKEN_BUDGET,
  estimateTokens,
  truncateToTokens,
} from './llm-providers.js';

const rssParser = new Parser({ timeout: 8000 });

// ── Config ───────────────────────────────────────────────────
const BATCH_SIZE             = 50;
const MAX_NEWS_BODY_CHARS    = TOKEN_BUDGET.MAX_NEWS_ITEM_CHARS;
const MAX_PREV_SUMMARY_CHARS = TOKEN_BUDGET.MAX_PREV_SUMMARY_CHARS;

// A session started within this many ms is considered "active"
const SESSION_ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── IST Time Helpers ─────────────────────────────────────────
function getISTHour() {
  const now = new Date();
  // IST = UTC + 5:30
  const istMs = now.getTime() + 5.5 * 60 * 60 * 1000;
  const ist = new Date(istMs);
  return ist.getUTCHours() + ist.getUTCMinutes() / 60;
}

/**
 * lib/news-summary-pipeline.js - Core Logic for Batch Processing
 * --------------------------------------------------------
 * Is file mein asli logic likha hai jo news ko chote-chote batches (hisson) mein
 * fetch karta hai aur AI (LLM) se summarize karwata hai. Yeh cron pipeline ki madad karta hai.
 * --------------------------------------------------------
 * Returns the schedule slot if we are currently in a valid start window.
 * Returns null if outside all windows (no new session should start).
 */
export function getActiveScheduleSlot() {
  const h = getISTHour();
  if (h >= 6.5  && h < 9.0)  return 'morning';
  if (h >= 12.0 && h < 15.0) return 'noon';
  if (h >= 19.5 && h < 22.0) return 'evening';
  return null;
}

// ── News Sources ─────────────────────────────────────────────
const NEWSDATA_URL    = 'https://newsdata.io/api/1/news';
const GOOGLE_NEWS_RSS = 'https://news.google.com/rss/search?q=Bihar+politics&hl=hi-IN&gl=IN&ceid=IN:hi';
const BHASKAR_RSS     = 'https://www.bhaskar.com/rss-v1--category-3679.xml';

const LIVEHINDUSTAN_FEEDS = [
  ['बिहार',       'https://api.livehindustan.com/feeds/rss/bihar/rssfeed.xml'],
  ['पटना',        'https://api.livehindustan.com/feeds/rss/bihar/patna/rssfeed.xml'],
  ['भागलपुर',     'https://api.livehindustan.com/feeds/rss/bihar/bhagalpur/rssfeed.xml'],
  ['मुजफ्फरपुर',  'https://api.livehindustan.com/feeds/rss/bihar/muzaffarpur/rssfeed.xml'],
  ['आरा',         'https://api.livehindustan.com/feeds/rss/bihar/ara/rssfeed.xml'],
  ['बेगूसराय',    'https://api.livehindustan.com/feeds/rss/bihar/begusarai/rssfeed.xml'],
  ['बिहारशरीफ',   'https://api.livehindustan.com/feeds/rss/bihar/biharsharif/rssfeed.xml'],
  ['बक्सर',       'https://api.livehindustan.com/feeds/rss/bihar/buxar/rssfeed.xml'],
  ['छपरा',        'https://api.livehindustan.com/feeds/rss/bihar/chapra/rssfeed.xml'],
  ['गोपालगंज',    'https://api.livehindustan.com/feeds/rss/bihar/gopalganj/rssfeed.xml'],
  ['हाजीपुर',     'https://api.livehindustan.com/feeds/rss/bihar/hajipur/rssfeed.xml'],
  ['जहानाबाद',    'https://api.livehindustan.com/feeds/rss/bihar/jahanabad/rssfeed.xml'],
  ['सीवान',       'https://api.livehindustan.com/feeds/rss/bihar/siwan/rssfeed.xml'],
  ['गया',         'https://api.livehindustan.com/feeds/rss/bihar/gaya/rssfeed.xml'],
  ['औरंगाबाद',    'https://api.livehindustan.com/feeds/rss/bihar/aurangabad/rssfeed.xml'],
  ['भभुआ',        'https://api.livehindustan.com/feeds/rss/bihar/bhabua/rssfeed.xml'],
  ['नवादा',       'https://api.livehindustan.com/feeds/rss/bihar/nawada/rssfeed.xml'],
  ['सासाराम',     'https://api.livehindustan.com/feeds/rss/bihar/sasaram/rssfeed.xml'],
  ['बांका',       'https://api.livehindustan.com/feeds/rss/bihar/banka/rssfeed.xml'],
  ['अररिया',      'https://api.livehindustan.com/feeds/rss/bihar/araria/rssfeed.xml'],
  ['कटिहार',      'https://api.livehindustan.com/feeds/rss/bihar/katihar/rssfeed.xml'],
  ['खगड़िया',     'https://api.livehindustan.com/feeds/rss/bihar/khagaria/rssfeed.xml'],
  ['किशनगंज',     'https://api.livehindustan.com/feeds/rss/bihar/kishanganj/rssfeed.xml'],
  ['मधेपुरा',     'https://api.livehindustan.com/feeds/rss/bihar/madhepura/rssfeed.xml'],
  ['मुंगेर',      'https://api.livehindustan.com/feeds/rss/bihar/munger/rssfeed.xml'],
  ['पूर्णिया',    'https://api.livehindustan.com/feeds/rss/bihar/purnia/rssfeed.xml'],
  ['सहरसा',       'https://api.livehindustan.com/feeds/rss/bihar/saharsa/rssfeed.xml'],
  ['लखीसराय',     'https://api.livehindustan.com/feeds/rss/bihar/lakhisarai/rssfeed.xml'],
  ['जमुई',        'https://api.livehindustan.com/feeds/rss/bihar/jamui/rssfeed.xml'],
  ['सुपौल',       'https://api.livehindustan.com/feeds/rss/bihar/supaul/rssfeed.xml'],
  ['दरभंगा',      'https://api.livehindustan.com/feeds/rss/bihar/darbhanga/rssfeed.xml'],
  ['मधुबनी',      'https://api.livehindustan.com/feeds/rss/bihar/madhubani/rssfeed.xml'],
  ['बगहा',        'https://api.livehindustan.com/feeds/rss/bihar/bagaha/rssfeed.xml'],
  ['बेतिया',      'https://api.livehindustan.com/feeds/rss/bihar/bettiah/rssfeed.xml'],
  ['मोतिहारी',    'https://api.livehindustan.com/feeds/rss/bihar/motihari/rssfeed.xml'],
  ['समस्तीपुर',   'https://api.livehindustan.com/feeds/rss/bihar/samastipur/rssfeed.xml'],
  ['सीतामढ़ी',    'https://api.livehindustan.com/feeds/rss/bihar/sitamarhi/rssfeed.xml'],
];

// ── LLM System Prompt ────────────────────────────────────────
const SUMMARY_SYSTEM_PROMPT = `आप BJP Bihar War Room के लिए एक Senior Political Intelligence Analyst AI हैं।

आपको Bihar के विभिन्न समाचार स्रोतों से top news headlines और content दिए जाएंगे, साथ ही पिछले batch का summary भी।
इन सबके आधार पर आपको एक comprehensive political intelligence report बनानी है।

## आपके Output का JSON Format (सख्ती से follow करें):

{
  "overall_situation": "2-3 lines में Bihar की overall political/social situation — Hindi में",
  "political_temperature": "high | medium | low",
  "district_situation": {
    "जिले का नाम": "वहाँ क्या हो रहा है — 1-2 lines"
  },
  "party_activities": {
    "BJP": "BJP क्या कर रही है",
    "RJD": "RJD क्या कर रही है",
    "JDU": "JDU की गतिविधियाँ",
    "INC": "Congress Bihar activities",
    "Jan Suraaj": "Prashant Kishor / Jan Suraaj activities",
    "Other": "अन्य दलों की गतिविधियाँ"
  },
  "problem_areas": ["जहाँ हालात खराब हैं — 1-2 lines per item"],
  "critical_issues": ["जो मुद्दे बड़े हो सकते हैं"],
  "opposition_critique": "विपक्ष बिहार सरकार / BJP पर क्या आरोप लगा रही है",
  "key_events": ["आज की 3-5 सबसे important घटनाएं"],
  "narrative_threats": "कोई ऐसा narrative जो BJP के लिए problematic हो सकता है",
  "recommended_actions": "War Room के लिए 2-3 actionable suggestions"
}

## नियम:
1. केवल valid JSON लौटाएं — कोई markdown, backtick या extra text नहीं
2. सिर्फ facts — कोई speculation नहीं
3. Neutral analytical tone
4. अगर किसी field की जानकारी नहीं है तो null लिखें
5. Previous summary का context use करें लेकिन repeat न करें`;

// ── Helpers ───────────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normaliseTitle(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aW = new Set(a.split(' ').filter((w) => w.length > 2));
  const bW = new Set(b.split(' ').filter((w) => w.length > 2));
  const overlap = [...aW].filter((w) => bW.has(w)).length;
  return overlap / Math.max(aW.size, bW.size, 1);
}

function parseSummaryResponse(text) {
  try {
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('No JSON object found');
    return JSON.parse(text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
  } catch {
    return {
      overall_situation:     text.slice(0, 500),
      political_temperature: 'medium',
      district_situation:    {},
      party_activities:      {},
      problem_areas:         [],
      critical_issues:       [],
      opposition_critique:   null,
      key_events:            [],
      narrative_threats:     null,
      recommended_actions:   null,
    };
  }
}

// ── DB Helpers ────────────────────────────────────────────────
async function getActiveSession(supabase) {
  const since = new Date(Date.now() - SESSION_ACTIVE_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from('cron_sessions')
    .select('*')
    .in('status', ['fetching', 'processing'])
    .eq('session_type', 'news_fetch')
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

async function getUnprocessedCount(supabase, sessionId) {
  const { count } = await supabase
    .from('raw_items')
    .select('id', { count: 'exact', head: true })
    .eq('cron_session_id', sessionId)
    .eq('gemini_processed', false);
  return count || 0;
}

async function getUnprocessedBatch(supabase, sessionId) {
  const { data } = await supabase
    .from('raw_items')
    .select('id, title, content, source_name')
    .eq('cron_session_id', sessionId)
    .eq('gemini_processed', false)
    .order('raw_fetched_at', { ascending: false })
    .limit(BATCH_SIZE);
  return shuffleArray(data || []);
}

async function markBatchProcessed(supabase, itemIds, batchNum) {
  if (!itemIds.length) return;
  await supabase
    .from('raw_items')
    .update({ gemini_processed: true, batch_number: batchNum })
    .in('id', itemIds);
}

async function getPreviousSummaryForSession(supabase, sessionId) {
  const { data } = await supabase
    .from('news_summaries')
    .select('id, summary_content')
    .eq('cron_session_id', sessionId)
    .order('batch_number', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

async function getPreviousSessionFinalSummary(supabase) {
  const { data } = await supabase
    .from('news_summaries')
    .select('summary_content, created_at')
    .eq('is_final', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

function buildBatchPrompt(newsItems, previousSummaryText, batchNum, isFinal) {
  const prevContext = previousSummaryText
    ? `\n## पिछले Batch / Session का Summary (Context):\n${truncateToTokens(previousSummaryText, Math.floor(MAX_PREV_SUMMARY_CHARS / TOKEN_BUDGET.CHARS_PER_TOKEN))}\n\n`
    : '';

  const newsLines = newsItems.map((item, i) => {
    const body = (item.content || '').slice(0, MAX_NEWS_BODY_CHARS);
    return `${i + 1}. [${item.source_name}] ${item.title}${body ? `\n   ${body}` : ''}`;
  }).join('\n');

  return `${prevContext}## Batch ${batchNum} — ${newsItems.length} News Headlines:

${newsLines}

ऊपर दी गई news और context के आधार पर Bihar political intelligence report बनाएं।
${isFinal ? '\n⚡ यह आखिरी batch है — comprehensive FINAL summary बनाएं जो पूरे session की situation cover करे।' : ''}`;
}

// ═══════════════════════════════════════════════════════════════
// PHASE A — Fetch all news and save to DB (no LLM)
// Fast: ~10-20 seconds
// ═══════════════════════════════════════════════════════════════
export async function fetchAndSaveNews(scheduleSlot) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  // Create session
  const { data: sessionData, error: sessionErr } = await supabase
    .from('cron_sessions')
    .insert({
      session_type:  'news_fetch',
      schedule_slot: scheduleSlot,
      status:        'fetching',
      started_at:    new Date().toISOString(),
    })
    .select('id')
    .single();
  if (sessionErr) throw new Error(`Session create failed: ${sessionErr.message}`);
  const sessionId = sessionData.id;

  const items = [];

  // NewsData.io
  try {
    const apiKey = process.env.NEWS_DATA_API_KEY;
    if (apiKey) {
      const url = new URL(NEWSDATA_URL);
      url.searchParams.set('apikey', apiKey);
      url.searchParams.set('q', 'Bihar');
      url.searchParams.set('language', 'hi,en');
      url.searchParams.set('country', 'in');
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        for (const a of (data.results || [])) {
          items.push({ title: (a.title || '').slice(0, 500), content: (a.description || '').slice(0, 1000), url: a.link || '', source_name: 'NewsData.io', source_type: 'news', published_at: a.pubDate || null });
        }
      }
    }
  } catch { /* skip */ }

  // Google News RSS
  try {
    const feed = await rssParser.parseURL(GOOGLE_NEWS_RSS).catch(() => null);
    if (feed) {
      for (const e of (feed.items || []).slice(0, 50)) {
        items.push({ title: (e.title || '').slice(0, 500), content: (e.contentSnippet || '').slice(0, 1000), url: e.link || '', source_name: 'Google News', source_type: 'rss', published_at: e.isoDate || null });
      }
    }
  } catch { /* skip */ }

  // Bhaskar
  try {
    const res = await fetch(BHASKAR_RSS, { headers: { 'user-agent': 'Bihar-Dashboard/1.0' }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const feed = await rssParser.parseString(await res.text());
      for (const e of (feed.items || []).slice(0, 50)) {
        items.push({ title: (e.title || '').slice(0, 500), content: (e.contentSnippet || '').slice(0, 1000), url: e.link || '', source_name: 'Bhaskar Bihar', source_type: 'rss', published_at: e.isoDate || null });
      }
    }
  } catch { /* skip */ }

  // LiveHindustan — all districts in parallel
  const lhResults = await Promise.allSettled(
    LIVEHINDUSTAN_FEEDS.map(async ([name, feedUrl]) => {
      const res = await fetch(feedUrl, { headers: { 'user-agent': 'Bihar-Dashboard/1.0' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const feed = await rssParser.parseString(await res.text());
      return (feed.items || []).slice(0, 10).map((e) => ({
        title: (e.title || '').slice(0, 500), content: (e.contentSnippet || '').slice(0, 1000),
        url: e.link || '', source_name: `LiveHindustan ${name}`, source_type: 'rss', published_at: e.isoDate || null,
      }));
    })
  );
  for (const r of lhResults) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }

  console.log(`[Fetch] Total raw: ${items.length}`);

  // Dedup + save
  const { data: existing } = await supabase.from('raw_items').select('url, title').order('raw_fetched_at', { ascending: false }).limit(2000);
  const seenUrls   = new Set((existing || []).map((r) => r.url).filter(Boolean));
  const seenTitles = (existing || []).map((r) => normaliseTitle(r.title));

  const rows = [];
  for (const item of items) {
    if (!item.title) continue;
    const url      = item.url || `https://bihar-news-local/${encodeURIComponent(item.source_name)}/${encodeURIComponent(item.title)}`;
    const titleKey = normaliseTitle(item.title);
    if (seenUrls.has(url)) continue;
    if (seenTitles.some((t) => titleSimilarity(titleKey, t) >= 0.8)) continue;
    seenUrls.add(url);
    seenTitles.push(titleKey);
    rows.push({ ...item, url, cron_session_id: sessionId, gemini_processed: false });
  }

  let savedCount = 0;
  if (rows.length) {
    const { data: saved } = await supabase.from('raw_items').upsert(rows, { onConflict: 'url', ignoreDuplicates: true }).select('id');
    savedCount = saved?.length || 0;
  }

  // Update session → ready for processing
  await supabase.from('cron_sessions').update({
    status:        'processing',
    total_fetched: items.length,
    total_new:     savedCount,
  }).eq('id', sessionId);

  console.log(`[Fetch] Saved ${savedCount} new items. Session ${sessionId} ready.`);
  return { sessionId, totalFetched: items.length, totalNew: savedCount };
}

// ═══════════════════════════════════════════════════════════════
// PHASE B — Process ONE batch from an active session (with LLM)
// Fast: ~10-20 seconds (one LLM call)
// ═══════════════════════════════════════════════════════════════
export async function processNextBatch(sessionId) {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');

  // Get the batch
  const batch = await getUnprocessedBatch(supabase, sessionId);
  if (!batch.length) {
    // No more items — mark session complete
    await supabase.from('cron_sessions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', sessionId);
    console.log(`[Process] Session ${sessionId} complete — no more items.`);
    return { action: 'completed', sessionId };
  }

  // Check how many remain after this batch to determine if this is final
  const remaining  = await getUnprocessedCount(supabase, sessionId);
  const isFinal    = remaining <= BATCH_SIZE;

  // Get previous summary (within session for rolling context, else last session)
  const prevInSession = await getPreviousSummaryForSession(supabase, sessionId);
  let previousSummaryText = prevInSession?.summary_content || null;
  let previousSummaryId   = prevInSession?.id || null;

  // If no in-session summary yet, use last session's final summary as seed context
  if (!previousSummaryText) {
    const prevFinal = await getPreviousSessionFinalSummary(supabase);
    previousSummaryText = prevFinal?.summary_content || null;
  }

  // Get current batch number
  const { data: sessionData } = await supabase.from('cron_sessions').select('total_batches, total_processed').eq('id', sessionId).single();
  const batchNum = (sessionData?.total_batches || 0) + 1;

  // Build prompt
  const prompt = buildBatchPrompt(batch, previousSummaryText, batchNum, isFinal);
  console.log(`[Process] Batch ${batchNum}, ${batch.length} items, isFinal=${isFinal}, ~${estimateTokens(prompt)} tokens`);

  const t0 = Date.now();
  let llmResult;
  try {
    llmResult = await callLLMWithFallback(SUMMARY_SYSTEM_PROMPT, prompt);
  } catch (llmErr) {
    console.error(`[Process] All LLM providers failed:`, llmErr.message);
    // Mark items as processed anyway so next call moves on
    await markBatchProcessed(supabase, batch.map((n) => n.id), batchNum);
    await supabase.from('cron_sessions').update({ total_batches: batchNum, total_processed: (sessionData?.total_processed || 0) + batch.length }).eq('id', sessionId);
    return { action: 'llm_failed', sessionId, batchNum, error: llmErr.message };
  }
  const processingMs = Date.now() - t0;

  const inference = parseSummaryResponse(llmResult.content);

  // Save summary
  await supabase.from('news_summaries').insert({
    cron_session_id:     sessionId,
    batch_number:        batchNum,
    batch_size:          batch.length,
    news_headlines:      batch.map((n) => ({ title: n.title, source: n.source_name })),
    summary_content:     llmResult.content,
    inference,
    llm_provider:        llmResult.provider,
    llm_model:           llmResult.model,
    input_tokens:        llmResult.inputTokens,
    output_tokens:       llmResult.outputTokens,
    is_final:            isFinal,
    previous_summary_id: previousSummaryId,
    processing_time_ms:  processingMs,
  });

  // Mark items processed
  await markBatchProcessed(supabase, batch.map((n) => n.id), batchNum);

  // Update session
  const newProcessed = (sessionData?.total_processed || 0) + batch.length;
  await supabase.from('cron_sessions').update({
    total_batches:   batchNum,
    total_processed: newProcessed,
    ...(isFinal ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
  }).eq('id', sessionId);

  console.log(`[Process] Batch ${batchNum} done via ${llmResult.provider} in ${processingMs}ms. Remaining: ${remaining - batch.length}`);
  return {
    action:     isFinal ? 'batch_final' : 'batch_processed',
    sessionId,
    batchNum,
    batchSize:  batch.length,
    remaining:  Math.max(0, remaining - batch.length),
    provider:   llmResult.provider,
    processingMs,
  };
}
