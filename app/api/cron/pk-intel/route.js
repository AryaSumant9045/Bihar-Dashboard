/**
 * app/api/cron/pk-intel/route.js
 * ------------------------------------------------------------
 * Every-3-days AI pipeline for the PK Tracker page. Pulls the
 * freshest real signals about Prashant Kishor / Jan Suraaj:
 *   1. Jan Suraaj X posts        (supabase: xjansuraaj)
 *   2. Official press + interview (jsp-backend-nine.vercel.app)
 *   3. Recent Bihar district news (supabase: district_news)
 * Runs them through Gemini (Groq fallback) to produce a live
 * Activity Log, Strategy Cards, Movement Map and Social Monitor,
 * then stores one snapshot row in public.pk_intel.
 *
 * GET/POST /api/cron/pk-intel   (auth: ?secret=CRON_SECRET or Bearer)
 * Service-role DB access stays server-side, same as generate-insight.
 * ============================================================
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const JS_BACKEND = 'https://jsp-backend-nine.vercel.app/api/media/category';

// District → [lat, lng]. AI only picks district names; we attach real coords
// so markers never end up in the wrong place.
const DISTRICT_COORDS = {
  patna: [25.5941, 85.1376], gaya: [24.7914, 84.9994], bhagalpur: [25.2425, 86.9842],
  muzaffarpur: [26.1197, 85.3910], darbhanga: [26.1542, 85.8918], ara: [25.5536, 84.6638],
  arrah: [25.5536, 84.6638], begusarai: [25.4167, 86.1292], biharsharif: [25.1969, 85.5178],
  'bihar sharif': [25.1969, 85.5178], nalande: [25.1969, 85.5178], buxar: [25.5695, 83.9739],
  chapra: [25.7833, 84.7500], sarun: [25.7833, 84.7500], gopalganj: [26.4667, 84.4333],
  hajipur: [25.6873, 85.2140], jehanabad: [25.2167, 84.9833], jahanabad: [25.2167, 84.9833],
  siwan: [26.2196, 84.3567], aurangabad: [24.7520, 84.3742], bhabua: [25.0400, 83.6090],
  kaimur: [25.0400, 83.6090], nawada: [24.8845, 85.5370], sasaram: [24.9486, 84.0140],
  rohtas: [24.9486, 84.0140], banka: [24.8833, 86.9167], araria: [26.1667, 87.5167],
  katihar: [25.5430, 87.5780], khagaria: [25.5050, 86.4700], kishanganj: [26.1089, 87.9372],
  madhepura: [25.9167, 86.7833], munger: [25.3717, 86.4739], purnia: [25.7771, 87.4750],
  purnea: [25.7771, 87.4750], saharsa: [25.8833, 86.6000], lakhisarai: [25.1667, 86.1000],
  jamui: [24.9167, 86.2167], supaul: [26.1167, 86.6000], madhubani: [26.3500, 86.0667],
  bagaha: [27.1000, 84.1167], bettiah: [26.8000, 84.5000], 'west champaran': [26.8000, 84.5000],
  motihari: [26.6500, 84.9167], 'east champaran': [26.6500, 84.9167], samastipur: [25.8667, 85.7833],
  sitamarhi: [26.6000, 85.5000], sheohar: [26.5167, 85.3000], sheikhpura: [25.1400, 85.8400],
  shekhupura: [25.1400, 85.8400], vaishali: [25.6667, 85.4000], delhi: [28.6139, 77.2090],
  'new delhi': [28.6139, 77.2090], mumbai: [19.0760, 72.8777],
};

const SYSTEM_PROMPT = `
आप Prashant Kishor (PK) और Jan Suraaj के लिए एक Senior Political Intelligence Analyst हैं,
एक BJP Bihar war-room dashboard के लिए। आपको PK/Jan Suraaj के हालिया X (Twitter) पोस्ट,
official press releases/interviews और Bihar की ताज़ा ज़िला-स्तर खबरें दी जाएँगी।
इन सच्चे स्रोतों का विश्लेषण करके PK Tracker के लिए एक structured intelligence snapshot बनाएँ।

## सख्त नियम
1. CRITICAL: सभी JSON values/content हिंदी (Devanagari) में लिखें। Keys English में रहें।
2. सिर्फ़ दी गई सामग्री के facts पर आधारित रहें — कुछ गढ़ें नहीं, speculation कम से कम।
3. tone: professional, sharp, action-oriented, पर हमेशा factual; विरोधियों के लिए neutral भाषा।
4. "movement_map" में district का नाम सिर्फ़ इस सूची से चुनें (बिल्कुल यही spelling):
   Patna, Gaya, Bhagalpur, Muzaffarpur, Darbhanga, Ara, Begusarai, Biharsharif, Buxar, Chapra,
   Gopalganj, Hajipur, Jehanabad, Siwan, Aurangabad, Bhabua, Nawada, Sasaram, Banka, Araria,
   Katihar, Khagaria, Kishanganj, Madhepura, Munger, Purnia, Saharsa, Lakhisarai, Jamui, Supaul,
   Madhubani, Bagaha, Bettiah, Motihari, Samastipur, Sitamarhi, Delhi.
   सिर्फ़ वे ही districts डालें जिनका स्रोतों में वास्तव में ज़िक्र हो (max 6)।
5. अगर किसी section के लिए पर्याप्त data न हो, तो खाली array [] दें — बनावटी content न भरें।
6. "activity_log" के हर item में type इनमें से एक हो: meeting | event | statement | social.
   "time" सापेक्ष लिखें जैसे "2 दिन पहले", "आज"।
7. "strategy_cards" में 4–5 cards, focus = high | medium | low। हर card में PK/Jan Suraaj की
   एक strategic नीतिगत चाल का विश्लेषण हो — ध्यान केंद्रित करें: बाढ़-राहत नैरेटिव, युवा/नौकरी
   एजेंडा, कस्टोडियल डेथ/कानून-व्यवस्था, शिक्षा-व्यवस्था हमले, उपचुनाव momentum, जातिगत/वर्ग
   समीकरण, सरकारी दावों की पोल खोलना। cards कभी खाली [] न छोड़ें।
8. "social_stats" में ठीक 4 items इसी क्रम में: 🐦 Twitter, ▶ YouTube, 💬 WhatsApp, 📘 Facebook.
   mentions/change अनुमानित engagement दें (स्रोतों की सक्रियता से), change "+45%" जैसे format में।
   यह section भी कभी खाली न छोड़ें।
9. सिर्फ़ नीचे दिए JSON structure में जवाब दें — कोई markdown fencing (\`\`\`), कोई preamble नहीं।
   पहला character सीधे { होना चाहिए।

## Output JSON structure
{
  "activity_log": [
    {"type":"meeting|event|statement|social","title":"...","time":"...","summary":"..."}
  ],
  "strategy_cards": [
    {"title":"...","focus":"high|medium|low","desc":"..."}
  ],
  "movement_map": [
    {"district":"<सूची से>","purpose":"...","date":"YYYY-MM-DD"}
  ],
  "social_stats": [
    {"platform":"🐦 Twitter","mentions":"2.1M","change":"+45%"},
    {"platform":"▶ YouTube","mentions":"980K","change":"+65%"},
    {"platform":"💬 WhatsApp","mentions":"450K","change":"+120%"},
    {"platform":"📘 Facebook","mentions":"310K","change":"+28%"}
  ]
}
`;

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
    console.error('[pk-intel] JSON parse error:', err.message);
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

async function fetchJsonSafe(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

async function gatherSources(supabase) {
  const sources = { x: [], press: [], interviews: [], news: [] };

  // 1. Jan Suraaj X posts
  if (supabase) {
    const { data } = await supabase
      .from('xjansuraaj')
      .select('heading, url, published_at')
      .order('published_at', { ascending: false })
      .limit(25);
    sources.x = data || [];
  }

  // 2. Official press releases + interviews
  const [press, interviews] = await Promise.all([
    fetchJsonSafe(`${JS_BACKEND}/PressRelease`),
    fetchJsonSafe(`${JS_BACKEND}/Interview`),
  ]);
  sources.press = press.slice(0, 12).map(p => ({
    title: p.title || p.titleEn || '',
    date: p.date || p.createdAt || '',
    excerpt: String(p.excerpt || p.content || '').replace(/\s+/g, ' ').trim().slice(0, 200),
  }));
  sources.interviews = interviews.slice(0, 8).map(p => ({
    title: p.title || p.titleEn || '',
    date: p.date || p.createdAt || '',
  }));

  // 3. Recent Bihar district news (fresh live signal for map + activity)
  if (supabase) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('district_news')
      .select('district, title, published_at')
      .gte('published_at', weekAgo)
      .order('published_at', { ascending: false })
      .limit(60);
    sources.news = data || [];
  }

  return sources;
}

function buildUserContent(s) {
  const lines = [];
  lines.push('## Jan Suraaj के हालिया X (Twitter) पोस्ट:');
  lines.push(s.x.length
    ? s.x.map(p => `- ${p.heading || ''}${p.published_at ? ` (${String(p.published_at).slice(0, 10)})` : ''}`).join('\n')
    : '- (कोई पोस्ट उपलब्ध नहीं)');
  lines.push('\n## Official Press Releases (jansuraaj.org):');
  lines.push(s.press.length
    ? s.press.map(p => `- ${p.title}${p.date ? ` (${String(p.date).slice(0, 10)})` : ''}: ${p.excerpt}`).join('\n')
    : '- (उपलब्ध नहीं)');
  lines.push('\n## Official Interviews / Speeches:');
  lines.push(s.interviews.length
    ? s.interviews.map(p => `- ${p.title}${p.date ? ` (${String(p.date).slice(0, 10)})` : ''}`).join('\n')
    : '- (उपलब्ध नहीं)');
  lines.push('\n## Bihar की ताज़ा ज़िला-स्तर खबरें (district: headline):');
  lines.push(s.news.length
    ? s.news.map(n => `- [${n.district}] ${n.title}`).join('\n')
    : '- (उपलब्ध नहीं)');
  return lines.join('\n');
}

async function runAI(prompt) {
  let provider = 'gemini';
  try {
    const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await aiClient.models.generateContent({
      model: process.env.GEMINI_API_MODEL || 'gemini-2.5-flash',
      contents: prompt,
    });
    const parsed = extractJson(response.text);
    if (!parsed) throw new Error('Gemini returned invalid JSON');
    return { parsed, provider };
  } catch (geminiError) {
    console.warn(`[pk-intel][GEMINI ERROR] ${geminiError.message}. Falling back to Groq...`);
    const { Groq } = await import('groq-sdk');
    const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const groqResponse = await groqClient.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
      temperature: 0.5,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    });
    const parsed = extractJson(groqResponse.choices[0].message.content);
    if (!parsed) throw new Error('Groq returned invalid JSON');
    return { parsed, provider: 'groq' };
  }
}

function attachCoords(movement) {
  if (!Array.isArray(movement)) return [];
  return movement
    .map(m => {
      const key = String(m.district || '').toLowerCase().trim();
      const coord = DISTRICT_COORDS[key];
      if (!coord) return null;
      return {
        district: m.district,
        purpose: m.purpose || '',
        date: m.date || new Date().toISOString().slice(0, 10),
        lat: coord[0],
        lng: coord[1],
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

async function handle(request) {
  const authHeader = request.headers.get('authorization') || '';
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isUpstash = !!request.headers.get('upstash-signature');
  const isAuthorized = isUpstash || authHeader === `Bearer ${cronSecret}` || (!!cronSecret && secret === cronSecret);
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = makeSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    console.log('[pk-intel] Gathering live sources...');
    const sources = await gatherSources(supabase);
    const sourceCount = sources.x.length + sources.press.length + sources.interviews.length + sources.news.length;
    if (sourceCount === 0) {
      return NextResponse.json({ status: 'skipped', message: 'No live sources available to analyze.' });
    }

    const prompt = `${SYSTEM_PROMPT}\n\n${buildUserContent(sources)}`;
    console.log(`[pk-intel] Running AI over ${sourceCount} source items...`);
    const { parsed, provider } = await runAI(prompt);

    const movement = attachCoords(parsed.movement_map);
    const snapshot = {
      activity_log: Array.isArray(parsed.activity_log) ? parsed.activity_log.slice(0, 8) : [],
      strategy_cards: Array.isArray(parsed.strategy_cards) ? parsed.strategy_cards.slice(0, 6) : [],
      movement_map: movement,
      social_stats: Array.isArray(parsed.social_stats) ? parsed.social_stats.slice(0, 4) : [],
      source_count: sourceCount,
      ai_provider: provider,
    };

    if (searchParams.get('dry') === '1') {
      return NextResponse.json({ status: 'dry-run', snapshot });
    }

    const { error } = await supabase.from('pk_intel').insert(snapshot);
    if (error) throw error;

    console.log(`[pk-intel] Snapshot saved (provider=${provider}, sources=${sourceCount}, map=${movement.length}).`);
    return NextResponse.json({ status: 'success', provider, source_count: sourceCount, snapshot });
  } catch (err) {
    console.error('[pk-intel] ERROR:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }
