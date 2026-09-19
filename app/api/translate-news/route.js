/**
 * app/api/translate-news/route.js
 *
 * POST /api/translate-news
 *   body: { items: [{ id, title, summary?, body? }] }
 *   resp: { translations: { [id]: { title, summary?, body? } }, provider }
 *
 * Translates War Room news content (English → Hindi) with Gemini
 * (Groq fallback). The client caches results in localStorage, so each
 * news item is translated at most once.
 */
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;

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
    console.error('[translate-news] JSON parse error:', err.message);
    return null;
  }
}

function clip(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max) : text;
}

function buildPrompt(items) {
  const payload = items.map(item => ({
    id: String(item.id),
    title: clip(item.title, 500),
    summary: item.summary ? clip(item.summary, 700) : undefined,
    body: item.body ? clip(item.body, 4000) : undefined,
  }));
  return `You are a professional Hindi news translator for a Bihar political dashboard.
Translate every field of every item from English into natural, news-style Hindi (Devanagari script).
Rules:
- Keep names of people, parties, places, organisations and quoted terms in their original form where that reads naturally (e.g. BJP, RJD, Nitish Kumar).
- Preserve meaning and tone exactly; do not add or remove facts.
- Return ONLY strict JSON of this exact shape, no markdown, no commentary:
{"translations":{"<id>":{"title":"...","summary":"...","body":"..."}}}
- Include a key only for fields that were present in the input item; use the same id strings.
Items:
${JSON.stringify(payload)}`;
}

async function runAI(prompt) {
  try {
    const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await aiClient.models.generateContent({
      model: process.env.GEMINI_API_MODEL || 'gemini-2.5-flash',
      contents: prompt,
      config: { maxOutputTokens: 16384 },
    });
    const parsed = extractJson(response.text);
    if (!parsed) throw new Error('Gemini returned invalid JSON');
    return { parsed, provider: 'gemini' };
  } catch (geminiError) {
    console.warn(`[translate-news][GEMINI ERROR] ${geminiError.message}. Falling back to Groq...`);
    const { Groq } = await import('groq-sdk');
    const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const groqResponse = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    });
    const parsed = extractJson(groqResponse.choices[0].message.content);
    if (!parsed) throw new Error('Groq returned invalid JSON');
    return { parsed, provider: 'groq' };
  }
}

export async function POST(request) {
  let items;
  try {
    const body = await request.json();
    items = Array.isArray(body?.items) ? body.items : [];
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!items.length) return NextResponse.json({ translations: {}, provider: null });

  const clean = items
    .filter(item => item && item.id !== undefined && String(item.title || '').trim())
    .slice(0, 40);
  if (!clean.length) return NextResponse.json({ translations: {}, provider: null });

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'No AI provider configured', translations: {} }, { status: 500 });
  }

  try {
    const { parsed, provider } = await runAI(buildPrompt(clean));
    const raw = parsed?.translations && typeof parsed.translations === 'object' ? parsed.translations : {};
    const translations = {};
    for (const item of clean) {
      const id = String(item.id);
      const entry = raw[id];
      if (!entry || typeof entry !== 'object') continue;
      const out = {};
      if (typeof entry.title === 'string' && entry.title.trim()) out.title = entry.title.trim();
      if (item.summary && typeof entry.summary === 'string' && entry.summary.trim()) out.summary = entry.summary.trim();
      if (item.body && typeof entry.body === 'string' && entry.body.trim()) out.body = entry.body.trim();
      if (out.title) translations[id] = out;
    }
    return NextResponse.json({ translations, provider }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[translate-news] failed:', error.message);
    return NextResponse.json({ error: 'Translation failed', translations: {} }, { status: 502 });
  }
}
