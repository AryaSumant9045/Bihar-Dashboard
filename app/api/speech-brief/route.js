/**
 * app/api/speech-brief/route.js — Speech Intelligence Engine
 * ------------------------------------------------------------
 * POST /api/speech-brief  { district, event_type, audience, topic }
 *   District + Event + Audience + Topic se ek ready-to-use pre-event
 *   briefing banata hai — REAL district data par:
 *     1. district_news_<district>        → latest headlines
 *     2. district_summary_<district>     → AI political summary (risks, bjp/opp activity)
 *     3. opposition_news (district-tag)  → opposition claims
 *   Phir LLM (Gemini → Groq) se structured JSON banata hai aur
 *   speech_briefs table me save karta hai.
 *
 * GET /api/speech-brief?district=Patna&limit=6 → past briefs (history)
 * GET /api/speech-brief?limit=10               → recent briefs
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js';
import { resolveDistrict, districtNewsTable, districtSummaryTable } from '../../../lib/districts.js';
import { callLLMQuick } from '../../../lib/llm-providers.js';

export const maxDuration = 60;

function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

const MAX_NEWS = 40;
const MAX_OPPOSITION = 10;

const TONE_RULES = {
  'Balanced (Vikas-focused)': 'Tone संतुलित और विकास-केंद्रित रखें — उपलब्धियाँ मुख्य आकर्षण, आक्रामकता कम।',
  'Aggressive (Counter-attack)': 'Tone आक्रामक लेकिन fact-based रखें — opposition के दावों का डटकर जवाब, भाषा संयत (कोई personal attack नहीं)।',
  'Compassionate (Relief/Sympathy)': 'Tone सहानुभूतिपूर्ण रखें — पीड़ितों के साथ खड़े होने वाला, राहत और सहायता पर फोकस, राजनीति कम।',
  'Data-driven (Factual)': 'Tone पूरी तरह आंकड़ों पर आधारित रखें — हर बात में संख्या/तथ्य, भावनात्मक भाषा न्यूनतम।',
};
const DURATION_POINTS = { '5 min': '3-4 concise talking points', '10 min': '5 talking points', '20 min': '6-7 talking points (thoda detail me)', '30 min+': '7-8 talking points, har point ke saath 1 supporting detail' };

/* ── System prompt (spec ke mutabik, dynamic placeholders ke saath) ────── */
function buildSystemPrompt(district, eventType, audience, topic, opts = {}) {
  const tone = TONE_RULES[opts.tone] || TONE_RULES['Balanced (Vikas-focused)'];
  const points = DURATION_POINTS[opts.duration] || DURATION_POINTS['10 min'];
  return `आप BJP Bihar War Room के लिए एक Speech Intelligence Assistant हैं। एक नेता ${district} district में एक ${eventType} में ${audience} के सामने ${topic} विषय पर बोलने वाले हैं। आपको दिया गया district-data (news, political summary, opposition activity) इस्तेमाल करके एक ready-to-use briefing तैयार करनी है।

## Speech parameters
- Tone: ${opts.tone || 'Balanced (Vikas-focused)'} — ${tone}
- Duration: ${opts.duration || '10 min'} — इसी के हिसाब से suggested_talking_points में ${points} दें।${opts.compare_with ? `\n- Comparison: ${opts.compare_with} जिलों का data भी दिया गया है — comparative_context में इनकी असली तुलना दें (कौन सा जिला कैसे स्थिति में है)।` : ''}${opts.last_brief_points ? `\n- Last brief (${opts.last_brief_at}): पिछली briefing के talking points नीचे दिए हैं — "whats_new_since_last" में सिर्फ़ बताएं कि उसके बाद क्या नया/बदला है।` : ''}${opts.last_feedback ? `\n- पिछले event का feedback: ${opts.last_feedback} — इस learning को talking points/delivery में ध्यान रखें।` : ''}

## नियम
- सिर्फ़ दिए गए data के facts पर आधारित रहें — कोई तथ्य न गढ़ें।
- Opposition के दावों को neutral भाषा में report करें, "factual context" दें (यानी अगर कोई आंकड़ा/दावा data में उपलब्ध है जो उस claim को context देता है, वो शामिल करें) — defame न करें।
- Talking points actionable और audience-appropriate हों (जैसे "${audience}" audience के लिए मौजूदा topic से जुड़े points प्राथमिकता पाएँ)।
- अगर किसी section के लिए district-data में पर्याप्त जानकारी नहीं है, तो वही लिखें: "इस विषय पर district-specific data उपलब्ध नहीं, सामान्य राज्य-स्तरीय जानकारी इस्तेमाल करें"।
- पूरा output हिंदी (देवनागरी) में — JSON keys English रहेंगी।

## Output — केवल valid JSON (कोई markdown/backtick नहीं):
{
  "local_development_facts": ["3-5 bullet points — is district ke recent development projects/facts, jo data me mile"],
  "govt_bjp_achievements": ["3-5 bullet points — is district/topic se related BJP/sarkar ki achievements"],
  "current_local_concerns": ["2-4 bullet points — is district me abhi jo major public issues hain (political_risks se)"],
  "opposition_claims_context": [
    {"claim": "opposition ne kya kaha", "factual_context": "iska factual jawab/context, sirf data-based"}
  ],
  "relevant_statistics": ["agar koi specific numbers/data district-data me mile, wo yahan list karo"],
  "recent_local_developments": ["3-4 bullet points — pichle kuch dino ki important events is district me"],
  "suggested_talking_points": [
    {"point": "bolne layak point (audience/topic/tone ke hisaab se)", "confidence": "High ya Medium ya Low", "source": "ye point kis data/section se aaya — 3-6 shabd"}
  ],
  "avoid_mentioning": [
    {"topic": "कौन सा मुद्दा/आंकड़ा न बोलें", "reason": "क्यों — data unverified / विवादित / sensitive है"}
  ],
  "anticipated_tough_questions": [
    {"likely_question": "media या crowd से आ सकने वाला कठिन सवाल", "suggested_response_direction": "1 line का factual जवाब किस angle से दें"}
  ],
  "local_connect_points": ["इस district की local हस्तियाँ/जगह/हाल की घटनाएँ जिनसे audience तुरंत जुड़ाव महसूस करे — 2-4 points"],
  "comparative_context": "पड़ोसी जिलों या राज्य-स्तर की तुलना में इस district की स्थिति — 1-2 lines (data na ho to खाली string)",
  "media_soundbites": ["2-3 छोटी, quotable one-liners (10-15 शब्द) जो press/media के लिए सीधे use हो सकें"],
  "whats_new_since_last": ["पिछली briefing के बाद क्या नया/बदला — 2-4 points (पिछला data न हो तो खाली array)"],
  "delivery_tone_guidance": "1-2 lines — इस audience/event के लिए कैसी delivery style रखें (formal/emotional/energetic/data-heavy, pace, किस बात पर ज़ोर)"
}

## अतिरिक्त ज़रूरी नियम (risk-mitigation)
- "avoid_mentioning" में कम से कम 1-2 items डालें अगर data में कोई unverified आंकड़ा, विवादित मुद्दा या संवेदनशील बात दिखे (जैसे कोई केस जो अभी जाँच में है, कोई अपुष्ट figure)। कुछ न दिखे तो भी एक सामान्य सावधानी लिखें।
- "anticipated_tough_questions" में 2-3 सवाल डालें जो इस district के मौजूदा मुद्दों से सबसे ज़्यादा संभावित हैं (खासकर concerns/opposition claims से जुड़े)।
- "local_connect_points" में ऐसे points दें जो audience के साथ emotional/local जुड़ाव बनाएँ (local project, local हस्ती, हाल की घटना) — ये "recent_local_developments" से अलग, जुड़ाव वाला angle है।
- "media_soundbites" में ऐसी punchy lines दें जो headline बन सकें — सरल, स्पष्ट, fact-based।
- **हर talking point का "confidence" ईमानदारी से दें**: "High" = सरकारी/आधिकारिक आंकड़ा या multiple sources; "Medium" = news-reported (एक स्रोत से मज़बूत); "Low" = एक स्रोत/अपुष्ट — ऐसा point बोलने से पहले verify करें। "source" में छोटा सा लिखें कि point कहाँ से आया।
- ये सभी fields भी केवल दिए गए data के आधार पर भरें — कुछ न मिले तो खाली array/string रखें, गढ़ें नहीं।

केवल valid JSON दें।`;
}

function buildUserPrompt(district, topic, { news, summary, opposition, freshness, neighborData, lastBrief }) {
  const parts = [];
  parts.push(`## ${district} district की latest headlines (${news.length}):`);
  parts.push(news.length ? news.map((n, i) => `${i + 1}. ${n.heading}`).join('\n') : '(कोई headline उपलब्ध नहीं)');

  if (summary) {
    parts.push(`\n## ${district} का latest AI political summary:`);
    parts.push(`Overall: ${summary.overall_situation || '—'}`);
    if (Array.isArray(summary.political_risks) && summary.political_risks.length) {
      parts.push(`Political risks: ${summary.political_risks.map((r) => `${r?.issue || r} (${r?.risk_level || '?'})`).join(' | ')}`);
    }
    if (Array.isArray(summary.bjp_activity) && summary.bjp_activity.length) {
      parts.push(`BJP/sarkar activity: ${summary.bjp_activity.join(' | ')}`);
    }
    if (Array.isArray(summary.opposition_activity) && summary.opposition_activity.length) {
      parts.push(`Opposition activity: ${summary.opposition_activity.join(' | ')}`);
    }
  } else {
    parts.push(`\n## ${district} का AI political summary: (उपलब्ध नहीं)`);
  }

  parts.push(`\n## Opposition news (district-related, ${opposition.length}):`);
  parts.push(opposition.length ? opposition.map((o) => `- [${o.party || 'Opposition'}] ${o.heading}`).join('\n') : '(कोई district-tagged opposition news नहीं)');

  if (freshness) {
    parts.push(`\n## Data freshness: district data last updated ${freshness.last_updated || 'unknown'} (${freshness.age_hours != null ? freshness.age_hours + ' ghante purana' : 'age unknown'}).`);
    if (freshness.warning) parts.push(`⚠️ ${freshness.warning}`);
  }
  if (neighborData && neighborData.length) {
    parts.push(`\n## पड़ोसी जिलों की स्थिति (तुलना के लिए):`);
    parts.push(neighborData.map((n) => `- ${n.district}: ${n.news_count} news; ${n.overall_situation ? n.overall_situation.slice(0, 180) : 'summary नहीं'}${(n.top_risks || []).length ? ' | जोखिम: ' + n.top_risks.join(', ') : ''}`).join('\n'));
  }
  if (lastBrief) {
    parts.push(`\n## पिछली briefing के talking points (${new Date(lastBrief.created_at).toLocaleDateString('en-IN')}):`);
    parts.push((lastBrief.suggested_talking_points || []).slice(0, 6).map((t, i) => `${i + 1}. ${t}`).join('\n'));
    parts.push('(इनके बाद का data ऊपर दिया गया है — "whats_new_since_last" में सिर्फ़ नया/बदला हुआ बताएं)');
  }
  parts.push(`\nTopic: "${topic}" — is topic se directly judti news/points ko प्राथमिकता दें।`);
  parts.push('ऊपर के data से briefing JSON बनाएं।');
  return parts.join('\n');
}

function extractJson(text) {
  try {
    let cleaned = String(text || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '');
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
    return JSON.parse(cleaned.replace(/,\s*([}\]])/g, '$1'));
  } catch { return null; }
}

/** Truncated JSON repair (aakhri brackets close kar ke). */
function repairJson(text) {
  let str = String(text || '').trim().replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/, '');
  const start = str.indexOf('{');
  if (start < 0) return null;
  str = str.slice(start);
  const cuts = [];
  for (let i = str.length - 1; i > Math.max(0, str.length - 4000) && cuts.length < 25; i--) {
    const ch = str[i];
    if (ch === '}' || ch === ']') cuts.push(i + 1);
  }
  for (const cut of cuts) {
    const candidate = str.slice(0, cut).replace(/,\s*$/, '');
    const openArr = (candidate.match(/\[/g) || []).length - (candidate.match(/\]/g) || []).length;
    const openObj = (candidate.match(/\{/g) || []).length - (candidate.match(/\}/g) || []).length;
    const fixed = candidate + ']'.repeat(Math.max(openArr, 0)) + '}'.repeat(Math.max(openObj, 0));
    try { return JSON.parse(fixed); } catch { /* next */ }
  }
  return null;
}

const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

function normalizeBrief(b) {
  const out = { ...b };
  for (const k of ['local_development_facts', 'govt_bjp_achievements', 'current_local_concerns', 'relevant_statistics', 'recent_local_developments', 'suggested_talking_points']) {
    out[k] = asArray(out[k]);
  }
  out.opposition_claims_context = asArray(out.opposition_claims_context).map((c) =>
    typeof c === 'string' ? { claim: c, factual_context: '' } : { claim: c?.claim || '', factual_context: c?.factual_context || '' }
  );
  out.avoid_mentioning = asArray(out.avoid_mentioning).map((a) =>
    typeof a === 'string' ? { topic: a, reason: '' } : { topic: a?.topic || '', reason: a?.reason || '' }
  ).filter((a) => a.topic);
  out.anticipated_tough_questions = asArray(out.anticipated_tough_questions).map((q) =>
    typeof q === 'string' ? { likely_question: q, suggested_response_direction: '' } : { likely_question: q?.likely_question || '', suggested_response_direction: q?.suggested_response_direction || '' }
  ).filter((q) => q.likely_question);
  /* Talking points: objects {point, confidence, source} ya purane strings — dono chalein */
  out.suggested_talking_points = asArray(out.suggested_talking_points).map((t) =>
    typeof t === 'string' ? { point: t, confidence: '', source: '' } : { point: t?.point || String(t || ''), confidence: t?.confidence || '', source: t?.source || '' }
  ).filter((t) => t.point);
  out.delivery_tone_guidance = typeof out.delivery_tone_guidance === 'string' ? out.delivery_tone_guidance : '';
  out.local_connect_points = asArray(out.local_connect_points);
  out.comparative_context = typeof out.comparative_context === 'string' ? out.comparative_context : '';
  return out;
}

/** Supabase query ko safe chalao — error/exception par { data: [] }. */
async function safeQuery(builder) {
  try {
    const res = await builder;
    if (res?.error) { console.warn('[speech-brief] query error:', res.error.message); return { data: [] }; }
    return res || { data: [] };
  } catch (e) {
    console.warn('[speech-brief] query exception:', e.message);
    return { data: [] };
  }
}

/* ── Data collection ───────────────────────────────────────────────────── */
async function collectDistrictData(supabase, entry, neighbors = []) {
  const newsTable = districtNewsTable(entry.slug);
  const { data: news } = await safeQuery(
    supabase.from(newsTable).select('heading, url, published_at').order('published_at', { ascending: false }).limit(MAX_NEWS)
  );
  const newsRows = news || [];

  const { data: sumRows } = await safeQuery(
    supabase
      .from(districtSummaryTable(entry.slug))
      .select('overall_situation, political_risks, bjp_activity, opposition_activity, news_count, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
  );
  const summary = (sumRows || [])[0] || null;

  /* opposition_news: district match (EN ya HQ alias), warna state-level recent */
  const names = [entry.en, entry.hi, ...(entry.aliases || [])].filter(Boolean);
  let opposition = [];
  for (const n of names) {
    const { data } = await safeQuery(
      supabase
        .from('opposition_news')
        .select('party, heading, url, district, published_at')
        .ilike('district', `%${n}%`)
        .order('published_at', { ascending: false })
        .limit(MAX_OPPOSITION)
    );
    if ((data || []).length) { opposition = data; break; }
  }
  if (!opposition.length) {
    const { data } = await safeQuery(
      supabase
        .from('opposition_news')
        .select('party, heading, url, district, published_at')
        .order('published_at', { ascending: false })
        .limit(5)
    );
    opposition = data || [];
  }

  /* Data freshness — sabse taaza timestamp (news ya summary) */
  const stamps = [
    ...newsRows.map((n) => n.published_at),
    summary?.created_at,
  ].filter(Boolean).map((d) => Date.parse(d)).filter((n) => !isNaN(n));
  const newest = stamps.length ? Math.max(...stamps) : null;
  const ageHours = newest ? Math.round((Date.now() - newest) / 3600000 * 10) / 10 : null;
  const freshness = {
    last_updated: newest ? new Date(newest).toISOString() : null,
    news_last_at: newsRows.map((n) => n.published_at).filter(Boolean)[0] || null,
    summary_last_at: summary?.created_at || null,
    age_hours: ageHours,
    warning: ageHours != null && ageHours > 24
      ? `Ye data ${Math.round(ageHours / 24)} din purana hai — latest cheezein khud verify karein.`
      : null,
  };

  /* Comparison: padosi districts ka latest summary + headline counts */
  let neighborData = [];
  for (const nb of neighbors.slice(0, 3)) {
    const nbEntry = resolveDistrict(nb);
    if (!nbEntry || nbEntry.slug === entry.slug) continue;
    const { data: nbSum } = await safeQuery(
      supabase.from(districtSummaryTable(nbEntry.slug)).select('overall_situation, political_risks, created_at').order('created_at', { ascending: false }).limit(1)
    );
    const { count: nbNewsCount } = await safeQuery(
      supabase.from(districtNewsTable(nbEntry.slug)).select('id', { count: 'exact', head: true })
    );
    neighborData.push({
      district: nbEntry.en,
      news_count: nbNewsCount ?? 0,
      overall_situation: (nbSum || [])[0]?.overall_situation || '',
      top_risks: ((nbSum || [])[0]?.political_risks || []).slice(0, 2).map((r) => r?.issue || r),
    });
  }

  return { news: newsRows, summary, opposition, freshness, neighborData };
}

/** WhatsApp-shareable plain text (field staff ke liye forwardable). */
function buildShareText(district, eventType, audience, topic, brief, freshness) {
  const line = (t) => '─'.repeat(Math.min(String(t).length, 40));
  const sec = (title, items) => (items && items.length)
    ? `\n*${title}*\n${line(title)}\n${items.map((x) => '• ' + x).join('\n')}\n` : '';
  const claims = (brief.opposition_claims_context || [])
    .map((c) => `• *${c.claim}*\n  ↳ ${c.factual_context}`).join('\n');
  const qa = (brief.anticipated_tough_questions || [])
    .map((q, i) => `${i + 1}. *Q:* ${q.likely_question}\n   *A-angle:* ${q.suggested_response_direction}`).join('\n');
  const avoid = (brief.avoid_mentioning || [])
    .map((a) => `⛔ ${a.topic}${a.reason ? ' — ' + a.reason : ''}`).join('\n');

  return `🎙 *SPEECH BRIEF — ${district}*\n📅 ${eventType} | 👥 ${audience} | 📌 ${topic}\n` +
    (freshness?.last_updated ? `🗓 Data as of: ${new Date(freshness.last_updated).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${freshness.warning ? ' ⚠️ (' + freshness.warning + ')' : ''}\n` : '') +
    sec('🎤 Media Soundbites', brief.media_soundbites) +
    sec('🎯 सबसे पहले ये कहें (Talking Points)', (brief.suggested_talking_points || []).map((t) =>
      typeof t === 'string' ? t : `${t.point}${t.confidence ? ` [${t.confidence}${t.confidence === 'Low' ? ' — verify!' : ''}]` : ''}`
    )) +
    (brief.delivery_tone_guidance ? `\n*🗣 Delivery Style*\n${'-'.repeat(14)}\n${brief.delivery_tone_guidance}\n` : '') +
    sec('🆕 पिछली briefing से नया', brief.whats_new_since_last) +
    (avoid ? `\n*⛔ इन्हें न बोलें (Danger Zone)*\n${line('Danger Zone')}\n${avoid}\n` : '') +
    sec('📊 Local Development Facts', brief.local_development_facts) +
    sec('🪷 BJP / Sarkar Achievements', brief.govt_bjp_achievements) +
    sec('⚠️ Current Local Concerns', brief.current_local_concerns) +
    (claims ? `\n*🥊 Opposition Claims — Factual Context*\n${line('Opposition')}\n${claims}\n` : '') +
    (qa ? `\n*❓ आ सकने वाले कठिन सवाल (Q&A Prep)*\n${line('Q&A')}\n${qa}\n` : '') +
    sec('📍 Local Connect Points', brief.local_connect_points) +
    sec('📈 Relevant Statistics', brief.relevant_statistics) +
    sec('🗓 Recent Local Developments', brief.recent_local_developments) +
    (brief.comparative_context ? `\n*⚖️ Comparative Context*\n${brief.comparative_context}\n` : '') +
    `\n— BJP Bihar War Room`;
}

/* ── POST: generate ────────────────────────────────────────────────────── */
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const { district: districtInput, event_type, audience, topic, tone, duration, compare_with, mode, question } = body;

  /* ── Mode: 'ask' — district data par AI se seedha sawal ─────────────── */
  if (mode === 'ask') {
    const supabaseAsk = makeSupabase();
    if (!supabaseAsk) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    if (!districtInput || !question) return Response.json({ error: 'district aur question zaroori hain' }, { status: 400 });
    const askEntry = resolveDistrict(districtInput);
    if (!askEntry) return Response.json({ error: `Unknown district: ${districtInput}` }, { status: 400 });

    const d = await collectDistrictData(supabaseAsk, askEntry);
    const ctx = buildUserPrompt(askEntry.en, question, d);
    const askSystem = `आप BJP Bihar War Room के AI Assistant हैं। आपको ${askEntry.en} district का असली data (headlines, AI political summary, opposition news) दिया गया है।
नियम:
- सिर्फ़ दिए गए data पर आधारित जवाब दें — कोई तथ्य न गढ़ें। Data में न हो तो साफ़ कहें "इस बारे में data उपलब्ध नहीं"।
- जवाब हिंदी (देवनागरी) में, concise (4-8 lines या 3-5 bullets), actionable रखें।
- जहाँ आंकड़ा/तथ्य हो उसे quote करें। Opposition की बात हो तो neutral रहें।
- सिर्फ़ plain text जवाब दें (कोई JSON नहीं)।`;
    const askUser = `${ctx}\n\n## उपयोगकर्ता का सवाल:\n${question}\n\nउपरोक्त data के आधार पर सीधा जवाब दें।`;

    const errorsAsk = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await callLLMQuick(askSystem, askUser, { retries: 1, json: false, geminiMaxOutputTokens: 2500, maxOutputTokens: 1500 });
        const answer = String(res.content || '').trim();
        if (answer.length > 20) {
          return Response.json({
            status: 'success', mode: 'ask', district: askEntry.en, question, answer,
            provider: res.provider,
            sources: { news: d.news.length, has_summary: !!d.summary, opposition: d.opposition.length },
          });
        }
        throw new Error('empty answer');
      } catch (e) { errorsAsk.push(String(e.message).slice(0, 120)); await new Promise((r) => setTimeout(r, 1200)); }
    }
    return Response.json({ status: 'llm_failed', mode: 'ask', district: askEntry.en, errors: errorsAsk }, { status: 200 });
  }

  if (!districtInput || !event_type || !audience || !topic) {
    return Response.json({ error: 'district, event_type, audience aur topic — chaar fields zaroori hain' }, { status: 400 });
  }

  const supabase = makeSupabase();
  if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const entry = resolveDistrict(districtInput);
  if (!entry) return Response.json({ error: `Unknown district: ${districtInput}` }, { status: 400 });
  const districtName = entry.en;

  /* Neighbor list: user ne diya ya UP-Bihar ke logical neighbors */
  const NEIGHBOR_MAP = {
    Patna: ['Saran', 'Vaishali', 'Nalanda'], Bhagalpur: ['Munger', 'Banka', 'Katihar'], Gaya: ['Nawada', 'Aurangabad', 'Jehanabad'],
    Muzaffarpur: ['Vaishali', 'Sitamarhi', 'East Champaran'], Darbhanga: ['Madhubani', 'Samastipur', 'Sitamarhi'],
    Purnia: ['Katihar', 'Araria', 'Kishanganj'], Rohtas: ['Buxar', 'Kaimur', 'Aurangabad'], 'West Champaran': ['East Champaran', 'Gopalganj', 'Sheohar'],
  };
  const neighbors = Array.isArray(compare_with) ? compare_with : (compare_with ? [compare_with] : (NEIGHBOR_MAP[districtName] || []));

  /* Last brief for the same district (whats-new ke liye) */
  const { data: lastBriefRows } = await safeQuery(
    supabase.from('speech_briefs').select('created_at, suggested_talking_points, post_event_feedback').eq('district', districtName).order('created_at', { ascending: false }).limit(1)
  );
  const lastBrief = (lastBriefRows || [])[0] || null;
  const lastFeedback = lastBrief?.post_event_feedback
    ? `${lastBrief.post_event_feedback.media_coverage_tone || '—'} coverage; ${lastBrief.post_event_feedback.outcome_notes || ''}${lastBrief.post_event_feedback.what_worked ? ' Achha chala: ' + lastBrief.post_event_feedback.what_worked : ''}${lastBrief.post_event_feedback.what_didnt ? ' Achha nahi chala: ' + lastBrief.post_event_feedback.what_didnt : ''}`.trim()
    : null;

  const t0 = Date.now();
  const data = await collectDistrictData(supabase, entry, neighbors);

  const systemPrompt = buildSystemPrompt(districtName, event_type, audience, topic, { tone, duration, compare_with: neighbors.length, last_brief_points: lastBrief, last_brief_at: lastBrief?.created_at, last_feedback: lastFeedback });
  const userPrompt = buildUserPrompt(districtName, topic, { ...data, lastBrief });

  let brief = null;
  const errors = [];
  for (let attempt = 0; attempt < 2 && !brief; attempt++) {
    try {
      const res = await callLLMQuick(systemPrompt, userPrompt, {
        retries: 1,
        geminiMaxOutputTokens: 6000,
        maxOutputTokens: 3000,
      });
      const parsed = extractJson(res.content) || repairJson(res.content);
      if (!parsed || !Array.isArray(parsed.suggested_talking_points) || !parsed.suggested_talking_points.length) {
        throw new Error(`invalid/incomplete JSON (len=${String(res.content || '').length})`);
      }
      brief = normalizeBrief(parsed);
    } catch (error) {
      errors.push(`attempt ${attempt + 1}: ${String(error.message).slice(0, 140)}`);
      console.warn(`[speech-brief] attempt ${attempt + 1} failed: ${String(error.message).slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!brief) {
    return Response.json({
      status: 'llm_failed',
      district: districtName,
      sources: { news: data.news.length, has_summary: !!data.summary, opposition: data.opposition.length },
      errors,
    }, { status: 200 });
  }

  /* Save to speech_briefs (best-effort — table na ho to bhi briefing return ho) */
  const row = {
    district: districtName,
    event_type,
    audience,
    topic,
    local_development_facts: brief.local_development_facts,
    govt_bjp_achievements: brief.govt_bjp_achievements,
    current_local_concerns: brief.current_local_concerns,
    opposition_claims_context: brief.opposition_claims_context,
    relevant_statistics: brief.relevant_statistics,
    recent_local_developments: brief.recent_local_developments,
    suggested_talking_points: brief.suggested_talking_points,
  };
  let saved = null;
  let saveError = null;
  {
    const full = {
      ...row,
      /* Extra sections — ye columns migration 017 ke baad honge. */
      avoid_mentioning: brief.avoid_mentioning,
      anticipated_tough_questions: brief.anticipated_tough_questions,
      local_connect_points: brief.local_connect_points,
      comparative_context: brief.comparative_context,
      data_freshness: data.freshness,
    };
    const r1 = await supabase.from('speech_briefs').insert(full).select('id, created_at').single();
    if (r1.error) {
      /* Columns missing? base row se save karo taki cycle na tootey */
      const r2 = await supabase.from('speech_briefs').insert(row).select('id, created_at').single();
      saved = r2.data; saveError = r2.error;
      if (r1.error) console.warn('[speech-brief] extra columns missing (migration 017?) — base row saved');
    } else { saved = r1.data; }
  }

  /* Data confidence score — kitna solid data par brief bana */
  const src = { news: data.news.length, summary: !!data.summary, opposition: data.opposition.length };
  const confidence = Math.min(100, Math.round((src.news / 40) * 45 + (src.summary ? 35 : 0) + Math.min(src.opposition / 5, 1) * 20));

  return Response.json({
    status: 'success',
    district: districtName,
    event_type,
    audience,
    topic,
    tone: tone || 'Balanced (Vikas-focused)',
    duration: duration || '10 min',
    compared_with: (data.neighborData || []).map((n) => n.district),
    brief,
    data_confidence: confidence,
    data_freshness: data.freshness,
    share_text: buildShareText(districtName, event_type, audience, topic, brief, data.freshness),
    saved: !saveError,
    saved_id: saved?.id || null,
    created_at: saved?.created_at || null,
    sources: { news: data.news.length, has_summary: !!data.summary, opposition: data.opposition.length },
    elapsed_ms: Date.now() - t0,
  });
}

/* ── PUT: post-event feedback save (learning loop) ──────────────────────── */
export async function PUT(request) {
  let body = {};
  try { body = await request.json(); } catch { /* empty */ }
  const { id, outcome_notes, media_coverage_tone, what_worked, what_didnt } = body;
  if (!id) return Response.json({ error: 'brief id zaroori hai' }, { status: 400 });

  const supabase = makeSupabase();
  if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  const feedback = {
    outcome_notes: String(outcome_notes || '').slice(0, 2000),
    media_coverage_tone: ['Positive', 'Neutral', 'Negative'].includes(media_coverage_tone) ? media_coverage_tone : '',
    what_worked: String(what_worked || '').slice(0, 1000),
    what_didnt: String(what_didnt || '').slice(0, 1000),
    recorded_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('speech_briefs')
    .update({ post_event_feedback: feedback })
    .eq('id', id)
    .select('id, district, post_event_feedback')
    .single();

  if (error) {
    /* Column missing (migration 018)? — bata do, crash nahi */
    if (/column|PGRST204/i.test(error.message)) {
      return Response.json({ error: 'post_event_feedback column missing — migration 018 run karo', needs_migration: true }, { status: 200 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ status: 'success', item: data });
}

/* ── GET: history ──────────────────────────────────────────────────────── */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const districtInput = searchParams.get('district');
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit'), 10) || 6, 1), 20);

  const supabase = makeSupabase();
  if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });

  /* ── stats=1 → real dashboard numbers (fake stat cards ki jagah) ────── */
  if (searchParams.get('stats') === '1') {
    const { data: rows } = await safeQuery(supabase.from('speech_briefs').select('district, topic, suggested_talking_points, created_at').order('created_at', { ascending: false }).limit(500));
    const items = rows || [];
    const byDistrict = {};
    let points = 0;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let todayCount = 0;
    for (const r of items) {
      byDistrict[r.district] = (byDistrict[r.district] || 0) + 1;
      points += Array.isArray(r.suggested_talking_points) ? r.suggested_talking_points.length : 0;
      if (r.created_at && new Date(r.created_at) >= today) todayCount++;
    }
    const top = Object.entries(byDistrict).sort((a, b) => b[1] - a[1])[0] || null;
    return Response.json({
      status: 'success',
      stats: {
        total_briefs: items.length,
        briefs_today: todayCount,
        total_talking_points: points,
        districts_covered: Object.keys(byDistrict).length,
        top_district: top ? { name: top[0], count: top[1] } : null,
        last_brief_at: items[0]?.created_at || null,
      },
    });
  }

  let query = supabase
    .from('speech_briefs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (districtInput) {
    const entry = resolveDistrict(districtInput);
    if (entry) query = query.eq('district', entry.en);
  }
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ status: 'success', items: data || [] });
}
