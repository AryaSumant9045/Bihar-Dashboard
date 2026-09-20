/**
 * app/api/cron/pk-summary/route.js
 * ------------------------------------------------------------
 * PK Tracker AI Intelligence Summary. Combines 3 sources:
 *   1. opposition_summary (latest combined opposition insight)
 *   2. xjansuraaj        (latest 50 Jan Suraaj X posts)
 *   3. pk_rss            (latest 50 FetchRSS PK headlines)
 * Runs Gemini (primary) → Groq (fallback) and saves one row to
 * public.pk_tracker_summary. Read by the PK Tracker "AI Summary" card.
 *
 * GET/POST /api/cron/pk-summary   (auth: ?secret=CRON_SECRET or Bearer)
 * GET /api/cron/pk-summary?dry=1  (generate but don't save)
 * ============================================================
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `आप BJP Bihar President के Command Dashboard के Lead Political Intelligence Analyst हैं। आपका काम है Prashant Kishor (PK) और Jan Suraaj की राजनीतिक गतिविधियों का विश्लेषण करके BJP के नज़रिए से decision-ready intelligence तैयार करना — BJP को क्या risk है, BJP का क्या फायदा है, और BJP को क्या करना चाहिए।

## सख्त नियम
1. CRITICAL: सभी JSON values/content हिंदी (Devanagari) में लिखें। Keys English में रहें।
2. सिर्फ दिए गए data के facts पर आधारित रहें — कोई speculation या अफवाह नहीं।
3. Tone: Professional, direct, action-oriented — पर हमेशा factual. Opposition/PK के बारे में neutral भाषा, कोई defame/derogatory शब्द नहीं।
4. सिर्फ नीचे दिए JSON structure में जवाब दें — कोई markdown fencing नहीं। पहला character सीधे { होना चाहिए।
5. CRITICAL: Output में कभी भी इस बात का ज़िक्र न करें कि जानकारी कहाँ से आई है — कोई source, platform, feed, post, social media या "sources के आधार पर" जैसे शब्द इस्तेमाल न करें। सिर्फ सीधे facts और analysis दें।

## Output JSON structure
{
  "overall_situation": "Prashant Kishor/Jan Suraaj की current political activity का 3-4 line overview",
  "key_activities": ["PK/Jan Suraaj ने क्या किया/कहा — 3-5 bullet points"],
  "attacks_on_bjp": [{"attack_summary": "किस mudde पर BJP/sarkar पर निशाना", "severity": "Critical/High/Medium/Low"}],
  "bjp_advantage_points": ["PK/Jan Suraaj की कमजोरी/internal conflict/गलत statement जिससे BJP को फायदा — सिर्फ अगर data में स्पष्ट संकेत हो"],
  "risk_to_bjp": [{"issue": "...", "risk_level": "Critical/High/Medium/Low", "reason": "..."}],
  "counter_strategy_points": ["3-5 factual, actionable suggestions BJP के लिए जवाब देने के"]
}`;

function extractJson(text) {
  try {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```')) {
      const parts = cleaned.split('```');
      if (parts.length >= 3) cleaned = parts[1].replace(/^json/i, '').trim();
    }
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s !== -1 && e !== -1) cleaned = cleaned.slice(s, e + 1);
    return JSON.parse(cleaned);
  } catch { return null; }
}

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

async function gatherSources(supabase) {
  const [oppSum, xjs, pkrss] = await Promise.all([
    supabase.from('opposition_summary').select('*').order('created_at', { ascending: false }).limit(1),
    supabase.from('xjansuraaj').select('heading').order('published_at', { ascending: false }).limit(50),
    supabase.from('pk_rss').select('heading').order('published_at', { ascending: false }).limit(50),
  ]);
  return {
    oppSummary: (oppSum.data && oppSum.data[0]) || null,
    xjansuraaj: xjs.data || [],
    pkRss: pkrss.data || [],
  };
}

function buildPrompt(s, compact = false) {
  const xjs = compact ? s.xjansuraaj.slice(0, 25) : s.xjansuraaj;
  const rss = compact ? s.pkRss.slice(0, 25) : s.pkRss;
  const lines = [SYSTEM_PROMPT, ''];

  // Neutral labels — model को data के origin का पता नहीं होना चाहिए
  lines.push('## 1. मौजूदा राजनीतिक context:');
  if (s.oppSummary) {
    const o = s.oppSummary;
    lines.push(`Overall: ${o.overall_situation || ''}`);
    if (Array.isArray(o.attacks_on_bjp) && o.attacks_on_bjp.length) {
      lines.push('Attacks on BJP: ' + o.attacks_on_bjp.map(a => (typeof a === 'string' ? a : a.attack_summary)).join(' | '));
    }
  } else lines.push('- (none)');

  lines.push('\n## 2. PK/Jan Suraaj — latest updates:');
  const pkLines = [...xjs, ...rss].map(n => `- ${n.heading}`);
  lines.push(pkLines.length ? pkLines.join('\n') : '- (none)');

  return lines.join('\n');
}

async function runAI(prompt, compactPrompt) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 60000)); // Gemini per-minute quota reset
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const resp = await aiClient.models.generateContent({
        model: process.env.GEMINI_API_MODEL || 'gemini-2.5-flash', contents: prompt,
      });
      const parsed = extractJson(resp.text);
      if (parsed) return { parsed, provider: 'gemini' };
    } catch (e) { console.warn(`[pk-summary][GEMINI ${attempt + 1}] ${e.message}`); }
  }
  const { Groq } = await import('groq-sdk');
  const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const resp = await groqClient.chat.completions.create({
    messages: [{ role: 'user', content: compactPrompt }], model: 'openai/gpt-oss-20b', temperature: 0.3, max_tokens: 3500,
  });
  const parsed = extractJson(resp.choices[0].message.content);
  if (!parsed) throw new Error('Groq returned invalid JSON');
  return { parsed, provider: 'groq' };
}


async function handle(request) {
  const authHeader = request.headers.get('authorization') || '';
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || '';
  const cronSecret = (process.env.CRON_SECRET || 'bihar-cron-secret-2026');
  const isUpstash = !!request.headers.get('upstash-signature');
  const isAuthorized = isUpstash || authHeader === `Bearer ${cronSecret}` || (!!cronSecret && secret === cronSecret);
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    const sources = await gatherSources(supabase);
    const sourceCount = sources.xjansuraaj.length + sources.pkRss.length + (sources.oppSummary ? 1 : 0);
    if (!sources.xjansuraaj.length && !sources.pkRss.length) {
      return NextResponse.json({ status: 'skipped', message: 'No PK source data yet. Run pk-rss ingestion first.' });
    }

    const { parsed, provider } = await runAI(buildPrompt(sources), buildPrompt(sources, true));

    const payload = {
      overall_situation: parsed.overall_situation || '',
      key_activities: Array.isArray(parsed.key_activities) ? parsed.key_activities : [],
      attacks_on_bjp: Array.isArray(parsed.attacks_on_bjp) ? parsed.attacks_on_bjp : [],
      bjp_advantage_points: Array.isArray(parsed.bjp_advantage_points) ? parsed.bjp_advantage_points : [],
      risk_to_bjp: Array.isArray(parsed.risk_to_bjp) ? parsed.risk_to_bjp : [],
      counter_strategy_points: Array.isArray(parsed.counter_strategy_points) ? parsed.counter_strategy_points : [],
      news_count: sourceCount,
    };

    if (searchParams.get('dry') === '1') {
      return NextResponse.json({ status: 'dry-run', provider, source_count: sourceCount, payload });
    }

    const { data, error } = await supabase.from('pk_tracker_summary').insert(payload).select('id');
    if (error) throw error;

    console.log(`[pk-summary] Saved (provider=${provider}, sources=${sourceCount}).`);
    return NextResponse.json({ status: 'success', provider, source_count: sourceCount, id: data?.[0]?.id, payload });
  } catch (err) {
    console.error('[pk-summary] ERROR:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }

