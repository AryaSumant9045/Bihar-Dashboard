/**
 * app/api/cron/issues-pipeline/route.js
 * ------------------------------------------------------------
 * Twice-daily AI pipeline (11 AM & 5 PM IST) for the
 * "📋 Issues & Grievances" page. Reads the freshest rows from
 * public.district_news (Live Hindustan district feeds) and asks
 * Gemini (Groq fallback) to surface REAL local/public issues —
 * floods, crime, corruption, health, education, infrastructure —
 * district-wise, then replaces the rows in public.issues.
 *
 * GET/POST /api/cron/issues-pipeline   (auth: ?secret=CRON_SECRET or Bearer)
 * GET /api/cron/issues-pipeline?dry=1  (generate but don't write)
 * ============================================================
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are a Bihar BJP war-room Field Intelligence Analyst. From the district headlines given below, extract REAL local/public issues & grievances (floods, crime, corruption, health, education, infrastructure, social tension, govt-scheme problems, political activity).

STRICT RULES:
1. CRITICAL: All JSON values in Hindi (Devanagari). Keys stay in English.
2. Base everything ONLY on the given headlines — invent nothing. Skip non-issues (gold/silver prices, ads, horoscope, entertainment).
3. Return 8–12 issues. Each tied to one district; use district "Multiple" for state-level news.
4. category one of: Disaster | Law & Order | Corruption | Health | Education | Infrastructure | Social | Economy | Political
5. priority: urgent|high|medium|low  ·  status: open|in-progress|escalated (escalated only if administration/court involved)
6. description: 1–2 factual sentences from the headline.
7. reportedBy always "Media Report".
8. Reply ONLY with JSON, no markdown fences, first character must be {.

OUTPUT JSON:
{"issues":[{"title":"...","category":"...","priority":"urgent","status":"open","district":"...","date":"YYYY-MM-DD","description":"...","reportedBy":"Media Report","source_url":"<url if given>"}]}`;

function extractJson(text) {
  try {
    let cleaned = String(text || '').trim();
    if (cleaned.startsWith('```')) {
      const parts = cleaned.split('```');
      if (parts.length >= 3) cleaned = parts[1].replace(/^json/i, '').trim();
    }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleaned = cleaned.slice(start, end + 1);
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[issues-pipeline] JSON parse error:', err.message);
    return null;
  }
}

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

async function gatherHeadlines(supabase) {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('district_news')
    .select('district, title, url, published_at')
    .gte('published_at', threeDaysAgo)
    .order('published_at', { ascending: false })
    .limit(55);
  if (error) throw error;
  return data || [];
}

function buildUserContent(rows) {
  const lines = ['## Bihar district headlines (district | date | headline | url):'];
  lines.push(rows.length
    ? rows.map(n => `- [${n.district || 'Multiple'}] ${String(n.published_at || '').slice(0, 10)} | ${n.title} | ${n.url || ''}`).join('\n')
    : '- (none)');
  return lines.join('\n');
}

/* Compact variant (20 headlines, no URLs) for the Groq fallback so the
   request stays under the smaller model's TPM/context limit. */
const COMPACT_PROMPT = `You are a Bihar war-room analyst. From the district headlines below, extract 8-12 REAL local/public issues (floods, crime, corruption, health, education, infrastructure, social tension, govt problems). Rules: JSON values in Hindi, keys English. category one of Disaster|Law & Order|Corruption|Health|Education|Infrastructure|Social|Economy|Political. priority urgent|high|medium|low. status open|in-progress|escalated. description 1 sentence. reportedBy "Media Report". source_url null. date YYYY-MM-DD. Reply ONLY with JSON, first char {.
OUTPUT: {"issues":[{"title":"...","category":"...","priority":"urgent","status":"open","district":"...","date":"...","description":"...","reportedBy":"Media Report","source_url":null}]}`;

function buildCompactContent(rows) {
  const lines = [COMPACT_PROMPT, '', '## Headlines (district | date | headline):'];
  lines.push(rows.length
    ? rows.map(n => `- [${n.district || 'Multiple'}] ${String(n.published_at || '').slice(0, 10)} | ${n.title}`).join('\n')
    : '- (none)');
  return lines.join('\n');
}


async function runGemini(prompt) {
  const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await aiClient.models.generateContent({
    model: process.env.GEMINI_API_MODEL || 'gemini-2.5-flash',
    contents: prompt,
  });
  const parsed = extractJson(response.text);
  if (!parsed) throw new Error('Gemini returned invalid JSON');
  return parsed;
}

async function runAI(prompt, compactPrompt) {
  // Gemini: 3 attempts (rate limits are per-minute; retry after 20s)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`[issues-pipeline] Gemini retry ${attempt} after 20s...`);
        await new Promise(r => setTimeout(r, 12000)); // short wait — 60s Vercel Hobby limit
      }
      const parsed = await runGemini(prompt);
      return { parsed, provider: 'gemini' };
    } catch (geminiError) {
      console.warn(`[issues-pipeline][GEMINI attempt ${attempt + 1}] ${geminiError.message}`);
    }
  }
  // Groq fallback — compact prompt (no URLs), no forced json_object mode
  // (gpt-oss returns empty with it); extractJson() strips any fencing.
  console.warn('[issues-pipeline] Falling back to Groq (compact prompt)...');
  const { Groq } = await import('groq-sdk');
  const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const groqResponse = await groqClient.chat.completions.create({
    messages: [{ role: 'user', content: compactPrompt }],
    model: 'openai/gpt-oss-20b',
    temperature: 0.3,
    max_tokens: 3000,
  });
  const parsed = extractJson(groqResponse.choices[0].message.content);
  if (!parsed) throw new Error('Groq returned invalid JSON');
  return { parsed, provider: 'groq' };
}

const VALID_PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const VALID_STATUS = ['open', 'in-progress', 'escalated'];

function sanitizeIssues(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(i => ({
      title: String(i.title || '').trim().slice(0, 200),
      category: String(i.category || 'Political').trim().slice(0, 40),
      priority: VALID_PRIORITIES.includes(i.priority) ? i.priority : 'medium',
      status: VALID_STATUS.includes(i.status) ? i.status : 'open',
      district: String(i.district || 'Multiple').trim().slice(0, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : new Date().toISOString().slice(0, 10),
      description: String(i.description || '').trim().slice(0, 500),
      reported_by: 'Media Report',
      source_url: i.source_url && String(i.source_url).startsWith('http') ? String(i.source_url) : null,
    }))
    .filter(i => i.title && i.description)
    .slice(0, 12);
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
    console.log('[issues-pipeline] Gathering district headlines...');
    const headlines = await gatherHeadlines(supabase);
    if (!headlines.length) {
      return NextResponse.json({ status: 'skipped', message: 'No district news available to analyze.' });
    }

    const prompt = `${SYSTEM_PROMPT}\n\n${buildUserContent(headlines)}`;
    const compactPrompt = buildCompactContent(headlines.slice(0, 20));
    console.log(`[issues-pipeline] Running AI over ${headlines.length} headlines...`);
    const { parsed, provider } = await runAI(prompt, compactPrompt);

    const issues = sanitizeIssues(parsed.issues);
    if (!issues.length) {
      return NextResponse.json({ status: 'failed', error: 'AI returned zero usable issues', provider }, { status: 500 });
    }

    if (searchParams.get('dry') === '1') {
      return NextResponse.json({ status: 'dry-run', provider, headline_count: headlines.length, issues });
    }

    // Full refresh: clear previous AI-generated issues, insert the fresh batch.
    const { error: delError } = await supabase.from('issues').delete().neq('id', 0);
    if (delError) throw new Error(`Delete failed: ${delError.message}`);

    const { data, error } = await supabase.from('issues').insert(issues).select('id');
    if (error) throw error;

    console.log(`[issues-pipeline] Saved ${data?.length || 0} issues (provider=${provider}).`);
    return NextResponse.json({
      status: 'success',
      provider,
      headline_count: headlines.length,
      inserted: data?.length || 0,
      issues,
    });
  } catch (err) {
    console.error('[issues-pipeline] ERROR:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }

