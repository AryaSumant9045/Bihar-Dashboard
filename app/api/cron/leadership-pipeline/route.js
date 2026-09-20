/**
 * app/api/cron/leadership-pipeline/route.js
 * ------------------------------------------------------------
 * Twice-daily AI pipeline (6 AM & 5 PM IST) for the Leadership Tracker.
 * Reads fresh Bihar political news (state RSS + district_news table)
 * and asks Gemini (Groq fallback) to extract LEADER ACTIVITIES —
 * which Minister/MP/MLA/Office-bearer did what, where, and its impact.
 * Writes to: public.leader_activities (insert) + public.leaders (upsert
 * with LPI = Leadership Performance Index).
 *
 * GET/POST /api/cron/leadership-pipeline   (auth: ?secret=CRON_SECRET)
 * GET /api/cron/leadership-pipeline?dry=1  (no DB write)
 * ============================================================
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import Parser from 'rss-parser';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/* ── Known Bihar leaders registry (seed; pipeline upserts by name) ── */
/* ── BJP Bihar Official Tracked Leaders Registry (from Command Dashboard doc) ── */
const KNOWN_LEADERS = [
  // CATEGORY 1: State Cabinet & Senior Leadership
  { name: 'Samrat Choudhary', designation: 'Deputy Chief Minister', category: 'Cabinet', party: 'BJP', district: 'Patna', aliases: ['samrat', 'सम्राट चौधरी', 'सम्राट'] },
  { name: 'Vijay Kumar Sinha', designation: 'Deputy Chief Minister', category: 'Cabinet', party: 'BJP', district: 'Lakhisarai', aliases: ['vijay sinha', 'विजय सिन्हा', 'विजय कुमार सिन्हा'] },
  { name: 'Mangal Pandey', designation: 'Health Minister', category: 'Cabinet', party: 'BJP', district: 'Siwan', aliases: ['mangal pandey', 'मंगल पांडे'] },
  { name: 'Nitin Nabin', designation: 'Road Construction Minister', category: 'Cabinet', party: 'BJP', district: 'Patna', aliases: ['nitin nabin', 'नितिन नबीन'] },
  { name: 'Shreyasi Singh', designation: 'Sports & Youth Affairs Minister', category: 'Cabinet', party: 'BJP', district: 'Jamui', aliases: ['shreyasi', 'श्रेयसी'] },
  { name: 'Kedar Prasad Gupta', designation: 'Panchayati Raj Minister', category: 'Cabinet', party: 'BJP', district: 'Muzaffarpur', aliases: ['kedar gupta', 'केदार गुप्ता'] },
  { name: 'Santosh Kumar Singh', designation: 'Labor Resources Minister', category: 'Cabinet', party: 'BJP', district: 'Rohtas', aliases: ['santosh singh', 'संतोष सिंह'] },
  { name: 'Hari Sahni', designation: 'Fisheries & Animal Husbandry Minister', category: 'Cabinet', party: 'BJP', district: 'Darbhanga', aliases: ['hari sahni', 'हरि साहनी'] },
  // CATEGORY 2: Central Ministers & Lok Sabha MPs
  { name: 'Giriraj Singh', designation: 'Union Minister', category: 'MP', party: 'BJP', district: 'Begusarai', aliases: ['giriraj', 'गिरिराज सिंह', 'गिरिराज'] },
  { name: 'Nityanand Rai', designation: 'Union MoS Home', category: 'MP', party: 'BJP', district: 'Samastipur', aliases: ['nityanand rai', 'नित्यानंद राय'] },
  { name: 'Radha Mohan Singh', designation: 'MP & Senior Leader', category: 'MP', party: 'BJP', district: 'Motihari', aliases: ['radha mohan', 'राधा मोहन'] },
  { name: 'Ravi Shankar Prasad', designation: 'MP (Lok Sabha)', category: 'MP', party: 'BJP', district: 'Patna', aliases: ['ravi shankar prasad', 'रवि शंकर प्रसाद'] },
  { name: 'Rajiv Pratap Rudy', designation: 'MP', category: 'MP', party: 'BJP', district: 'Chapra', aliases: ['rudy', 'राजीव प्रताप रूडी'] },
  { name: 'Sanjay Jaiswal', designation: 'MP & Former State President', category: 'MP', party: 'BJP', district: 'Bettiah', aliases: ['sanjay jaiswal', 'संजय जायसवाल'] },
  { name: 'Janardan Singh Sigriwal', designation: 'MP', category: 'MP', party: 'BJP', district: 'Siwan', aliases: ['sigriwal', 'सिगरीवाल'] },
  { name: 'Gopal Jee Thakur', designation: 'MP', category: 'MP', party: 'BJP', district: 'Darbhanga', aliases: ['gopal jee', 'गोपाल जी ठाकुर'] },
  { name: 'Pradeep Kumar Singh', designation: 'MP', category: 'MP', party: 'BJP', district: 'Araria', aliases: ['pradeep singh', 'प्रदीप सिंह'] },
  { name: 'Vivek Thakur', designation: 'MP', category: 'MP', party: 'BJP', district: 'Nawada', aliases: ['vivek thakur', 'विवेक ठाकुर'] },
  // CATEGORY 3: Rajya Sabha MPs & Key MLCs
  { name: 'Dharmshila Gupta', designation: 'Rajya Sabha MP', category: 'MP', party: 'BJP', district: 'Darbhanga', aliases: ['dharmshila', 'धर्मशिला'] },
  { name: 'Bhim Singh', designation: 'Rajya Sabha MP', category: 'MP', party: 'BJP', district: 'Multiple', aliases: ['bhim singh', 'भीम सिंह'] },
  { name: 'Shambhu Sharan Patel', designation: 'Rajya Sabha MP', category: 'MP', party: 'BJP', district: 'Sheikhpura', aliases: ['shambhu patel', 'शंभु शरण'] },
  { name: 'Dilip Kumar Jaiswal', designation: 'MLC / BJP Bihar President', category: 'Office-Bearer', party: 'BJP', district: 'Kishanganj', aliases: ['dilip jaiswal', 'दिलीप जायसवाल', 'जयसवाल'] },
  // NDA allies tracked for context
  { name: 'Nitish Kumar', designation: 'Chief Minister', category: 'Cabinet', party: 'JDU', district: 'Patna', aliases: ['nitish', 'नीतीश कुमार', 'नीतीश'] },
  { name: 'Chirag Paswan', designation: 'Union Minister / LJP(RV) Chief', category: 'MP', party: 'LJP', district: 'Hajipur', aliases: ['chirag', 'चिराग पासवान', 'चिराग'] },
  { name: 'Jitan Ram Manjhi', designation: 'Union Minister / HAM Chief', category: 'MP', party: 'HAM', district: 'Gaya', aliases: ['manjhi', 'जीतन राम मांझी', 'मांझी'] },
];

const PRIORITY_RANK = { ROUTINE: 0, WATCH: 1, DEVELOPING: 2, CRITICAL: 3 };

const SYSTEM_PROMPT = `You are the Lead Political Intelligence Analyst & Data Agent for the BJP Bihar President's Command Dashboard ("BJP Bihar Leadership Intelligence Engine"). Monitor, standardize, analyze and grade all public activities, statements, field rallies and news media footprints of tracked Bihar political leaders from the given headlines.

== 1. TRACKED ENTITIES REGISTRY ==
[C1 State Cabinet & Senior Leadership]
Samrat Choudhary (Deputy CM) — Munger/Tarapur, Patna | Vijay Kumar Sinha (Deputy CM) — Lakhisarai, Infrastructure & Land | Mangal Pandey (Health Minister) — Siwan/Patna, Health | Nitin Nabin (Road Construction Minister) — Bankipur (Patna), Urban Dev | Shreyasi Singh (Sports/Youth Affairs Minister) — Jamui, Youth & Sports | Kedar Prasad Gupta (Panchayati Raj Minister) — Muzaffarpur | Santosh Kumar Singh (Labor Resources Minister) — Rohtas/Karakat | Hari Sahni (Fisheries & Animal Husbandry Minister) — Darbhanga, EBC Outreach
[C2 Central Ministers & Lok Sabha MPs]
Giriraj Singh (Union Minister) — Begusarai, Agriculture & Rural | Nityanand Rai (Union MoS Home) — Ujiarpur (Samastipur) | Radha Mohan Singh (MP, Senior Leader) — Purvi Champaran (Motihari) | Ravi Shankar Prasad (MP) — Patna Sahib, IT/Law/Urban | Rajiv Pratap Rudy (MP) — Saran (Chhapra), Skill Dev | Sanjay Jaiswal (MP, Ex-State President) — Paschim Champaran (Bettiah) | Janardan Singh Sigriwal (MP) — Maharajganj (Siwan/Saran) | Gopal Jee Thakur (MP) — Darbhanga/Mithilanchal | Pradeep Kumar Singh (MP) — Araria/Seemanchal | Vivek Thakur (MP) — Nawada/Magadh
[C3 Rajya Sabha MPs & Key MLCs]
Dharmshila Gupta (RS MP) — Women Outreach/Darbhanga | Bhim Singh (RS MP) — OBC/EBC Organization | Shambhu Sharan Patel (RS MP) — Sheikhpura/Magadh Cadre | Dilip Kumar Jaiswal (BJP Bihar President/MLC) — Seemanchal/Kishanganj
[C4 Organizational Office-Bearers]
State General Secretaries | Zila Adhyaksh (BJP District Presidents) | Morcha Chiefs (Yuva/Mahila/Kisan/EBC Morcha heads)
[NDA allies — tracked for context]
Nitish Kumar (CM, JDU) | Chirag Paswan (Union Minister, LJP-RV) | Jitan Ram Manjhi (Union Minister, HAM)

ENTITY MATCHING: Match every headline against this registry first. Registry leader → use their exact English name. Any named leader not in registry → still extract (party from headline). Unnamed local functionary (e.g. "जिला अध्यक्ष", "मोर्चा प्रमुख") → leader_name "Unlisted Party Leader / Local Representative", designation from headline, category "Office-Bearer". No identifiable leader at all → skip that headline.

== 2. CLASSIFICATION RULES ==
- SPATIAL: district = Bihar district in English ("Patna"); "Multiple" if state-wide. constituency = seat/block/mandal if identifiable. venue = specific place if mentioned.
- event_type one of: Public Rally | Jan Samvad | Scheme Inauguration | Media Interaction | Press Conference | Internal Baithak | Grievance Redressal | Official Visit | Statement | Controversy
- issue_domain one of: Infrastructure | Flood/Agriculture | Law & Order | Youth/Employment | Party Cadre Conflict | Opposition Attack | Scheme/Welfare | Other
- media_coverage: Low (local blog/tweet) | Medium (regional online paper) | High (lead story in major daily/TV)
- sentiment_score: -1.0 (highly negative/controversial) to +1.0 (highly positive/well-received) — cadre & public reaction for the leader
- crowd_estimate: integer if mentioned else 0
- priority (EARLY WARNING SEVERITY):
  ROUTINE = standard administrative/party visits, routine inaugurations
  WATCH = minor local grievances raised, low turnout, localized opposition counter-claims
  DEVELOPING = cadre dissatisfaction reported, public protest during visit, sharp media criticism
  CRITICAL = open statement against party stance, major public backlash, severe law & order incident during visit needing immediate President intervention
- presidential_action: requires_intervention true only for DEVELOPING/CRITICAL. recommended_action = 1 short Hindi action for the President (e.g. "जिला अध्यक्ष से रिपोर्ट मांगें"); for ROUTINE/WATCH "कोई कार्रवाई नहीं".

== 3. STRICT OUTPUT RULES ==
1. Reply ONLY with strict JSON — first character { — no markdown fencing, no plaintext card, no extra text.
2. All JSON VALUES in Hindi (Devanagari). Keys, leader_name, district, enum values in English.
3. Base ONLY on the given headlines — invent nothing, no speculation.
4. TOKEN DISCIPLINE (free model): maximum 20 activities. summary = 1-2 short Hindi sentences. statement = short Hindi quote only if present else "". issues_raised = 1-3 short Hindi phrases. flag_reason = 1 Hindi sentence (empty "" for ROUTINE). recommended_action = max 1 line. title = max 12 words.
5. date = "YYYY-MM-DD" of the event if derivable, else today. source_url = the URL given with the headline, else "".

OUTPUT JSON:
{"activities":[{"leader_name":"...","designation":"...","category":"Cabinet|MP|MLA|Office-Bearer","party":"BJP|JDU|RJD|INC|HAM|LJP|Other","district":"...","constituency":"...","venue":"...","event_type":"...","issue_domain":"...","title":"...","summary":"...","statement":"...","issues_raised":["..."],"crowd_estimate":0,"media_coverage":"Low|Medium|High","sentiment_score":0.0,"priority":"ROUTINE|WATCH|DEVELOPING|CRITICAL","flag_reason":"...","recommended_action":"...","requires_intervention":false,"source_url":"","date":"YYYY-MM-DD"}]}`;


function makeSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    global: { fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' }) },
  });
}

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
  } catch {
    return null;
  }
}

async function gatherSources(supabase) {
  const parser = new Parser({ timeout: 20000 });
  const out = { state: [], district: [] };
  const feeds = [
    'https://news.google.com/rss/search?q=(%22Nitish+Kumar%22+OR+%22Samrat+Choudhary%22+OR+%22Bihar+minister%22+OR+%22Bihar+MLA%22+OR+%22Bihar+BJP%22)+when:2d&hl=hi&gl=IN&ceid=IN:hi',
  ];
  await Promise.all(feeds.map(async url => {
    try {
      const feed = await parser.parseURL(url);
      (feed.items || []).slice(0, 25).forEach(i => out.state.push({
        title: (i.title || '').trim(), url: i.link || '', published_at: i.isoDate || i.pubDate || null,
      }));
    } catch (e) { console.warn('[leadership] RSS fail:', e.message); }
  }));
  if (supabase) {
    const twoDays = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('district_news')
      .select('district, title, url, published_at')
      .gte('published_at', twoDays).order('published_at', { ascending: false }).limit(80);
    out.district = data || [];
  }
  return out;
}

function buildPrompt(s, compact = false) {
  const stateItems = compact ? s.state.slice(0, 12) : s.state;
  const distItems = compact ? s.district.slice(0, 20) : s.district;
  const prompt = compact ? SYSTEM_PROMPT : SYSTEM_PROMPT;
  const lines = [prompt, '', '## State-level Bihar political news:'];
  lines.push(stateItems.length ? stateItems.map(n => `- ${n.title}${compact ? '' : ' | ' + (n.url || '')}`).join('\n') : '- (none)');
  lines.push('\n## District news (district | headline):');
  lines.push(distItems.length ? distItems.map(n => `- [${n.district}] ${n.title}${compact ? '' : ' | ' + (n.url || '')}`).join('\n') : '- (none)');
  return lines.join('\n');
}

async function runAI(prompt, compactPrompt) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      // Wait 60s between retries so Gemini's per-minute free quota fully resets
      if (attempt > 0) await new Promise(r => setTimeout(r, 60000));
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const resp = await aiClient.models.generateContent({
        model: process.env.GEMINI_API_MODEL || 'gemini-2.5-flash', contents: prompt,
        config: { temperature: 0.2, maxOutputTokens: 3000, responseMimeType: 'application/json' },
      });
      const parsed = extractJson(resp.text);
      if (parsed) return { parsed, provider: 'gemini' };
    } catch (e) { console.warn(`[leadership][GEMINI ${attempt + 1}] ${e.message}`); }
  }
  // Groq fallback — small prompt, few headlines, plain-text JSON (no forced json_object)
  const { Groq } = await import('groq-sdk');
  const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const simplePrompt = `List 6-10 Bihar political leader activities from these headlines. JSON only, values in Hindi, max 10 activities. leader_name, designation, category(Cabinet|MP|MLA|Office-Bearer), party, district, event_type, issue_domain(Infrastructure|Flood/Agriculture|Law & Order|Youth/Employment|Party Cadre Conflict|Opposition Attack|Scheme/Welfare|Other), title, summary, priority(ROUTINE|WATCH|DEVELOPING|CRITICAL), date(YYYY-MM-DD). Start with {.
{"activities":[...]}
Headlines:
${compactPrompt.split('## District news')[1] ? compactPrompt.split('## District news')[1].slice(0, 2500) : compactPrompt.slice(0, 2500)}`;
  const resp = await groqClient.chat.completions.create({
    messages: [{ role: 'user', content: simplePrompt }], model: 'openai/gpt-oss-20b', temperature: 0.2, max_tokens: 2500,
  });
  const parsed = extractJson(resp.choices[0].message.content);
  if (!parsed) throw new Error('Groq returned invalid JSON');
  return { parsed, provider: 'groq' };
}


/* Match a headline-extracted leader to the known registry (by name/alias) */
function matchLeader(name) {
  const q = String(name || '').toLowerCase();
  if (!q) return null;
  return KNOWN_LEADERS.find(l =>
    q.includes(l.name.toLowerCase()) ||
    l.aliases.some(a => q.includes(a.toLowerCase()) || l.name.toLowerCase().includes(a.toLowerCase()))
  ) || null;
}

const VALID_PRIORITY = ['ROUTINE', 'WATCH', 'DEVELOPING', 'CRITICAL'];
const VALID_CATEGORY = ['Cabinet', 'MP', 'MLA', 'Office-Bearer'];
const VALID_ISSUE_DOMAIN = ['Infrastructure', 'Flood/Agriculture', 'Law & Order', 'Youth/Employment', 'Party Cadre Conflict', 'Opposition Attack', 'Scheme/Welfare', 'Other'];

function sanitize(list) {
  if (!Array.isArray(list)) return [];
  return list.map(a => {
    const known = matchLeader(a.leader_name);
    return {
      leader_name: (known ? known.name : String(a.leader_name || '').trim()).slice(0, 100),
      designation: (known ? known.designation : String(a.designation || 'Leader').trim()).slice(0, 80),
      category: VALID_CATEGORY.includes(a.category) ? a.category : (known ? known.category : 'MLA'),
      party: String(a.party || (known ? known.party : 'Other')).trim().slice(0, 12),
      district: String(a.district || (known ? known.district : 'Multiple')).trim().slice(0, 60),
      event_type: String(a.event_type || 'Statement').trim().slice(0, 60),
      issue_domain: VALID_ISSUE_DOMAIN.includes(a.issue_domain) ? a.issue_domain : 'Other',
      title: String(a.title || '').trim().slice(0, 200),
      summary: String(a.summary || '').trim().slice(0, 400),
      statement: String(a.statement || '').trim().slice(0, 250),
      issues_raised: Array.isArray(a.issues_raised) ? a.issues_raised.slice(0, 3).map(x => String(x).slice(0, 60)) : [],
      crowd_estimate: parseInt(a.crowd_estimate, 10) || 0,
      sentiment_score: Math.max(-1, Math.min(1, parseFloat(a.sentiment_score) || 0)),
      priority: VALID_PRIORITY.includes(a.priority) ? a.priority : 'ROUTINE',
      constituency: String(a.constituency || '').trim().slice(0, 80),
      venue: String(a.venue || '').trim().slice(0, 120),
      media_coverage: ['Low', 'Medium', 'High'].includes(a.media_coverage) ? a.media_coverage : 'Medium',
      flag_reason: String(a.flag_reason || '').trim().slice(0, 300),
      recommended_action: String(a.recommended_action || '').trim().slice(0, 300),
      requires_intervention: !!a.requires_intervention || (VALID_PRIORITY.includes(a.priority) && PRIORITY_RANK[a.priority] >= 2),
      source_url: a.source_url && String(a.source_url).startsWith('http') ? String(a.source_url) : null,
      occurred_at: /^\d{4}-\d{2}-\d{2}/.test(a.date) ? new Date(a.date).toISOString() : new Date().toISOString(),
    };
  }).filter(a => a.leader_name && a.title).slice(0, 20);
}

/* Compute LPI per leader and upsert into leaders table */
async function updateLeaders(supabase, activities) {
  const byLeader = {};
  activities.forEach(a => {
    if (!byLeader[a.leader_name]) byLeader[a.leader_name] = [];
    byLeader[a.leader_name].push(a);
  });

  for (const [name, acts] of Object.entries(byLeader)) {
    const known = matchLeader(name) || {};
    const fieldScore = Math.min(100, acts.length * 25);           // field activity
    const mediaScore = Math.min(100, acts.filter(x => x.source_url).length * 30);
    const socialScore = Math.min(100, Math.round(acts.reduce((s, x) => s + (x.sentiment_score + 1) * 25, 0) / acts.length));
    const grievance = Math.min(100, acts.filter(x => PRIORITY_RANK[x.priority] >= 2).length * 40);
    // LPI = 0.4*field + 0.25*media + 0.2*social - 0.15*grievance
    const lpi = Math.max(0, Math.min(100, Math.round(0.4 * fieldScore + 0.25 * mediaScore + 0.2 * socialScore - 0.15 * grievance)));
    const sentiment = socialScore >= 60 ? 'positive' : socialScore <= 40 ? 'negative' : 'neutral';
    const worst = acts.reduce((m, x) => Math.max(m, PRIORITY_RANK[x.priority] || 0), 0);
    const active_flag = ['ROUTINE', 'WATCH', 'DEVELOPING', 'CRITICAL'][worst];
    const last = acts.map(x => x.occurred_at).sort().pop();

    const row = {
      name, designation: known.designation || acts[0].designation,
      category: known.category || acts[0].category,
      party: known.party || acts[0].party,
      district: known.district || acts[0].district,
      lpi, sentiment, active_flag, activity_count: acts.length,
      last_activity_at: last, updated_at: new Date().toISOString(),
    };
    await supabase.from('leaders').upsert(row, { onConflict: 'name' });
  }
  return Object.keys(byLeader).length;
}

async function handle(request) {
  const authHeader = request.headers.get('authorization') || '';
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || '';
  const cronSecret = process.env.CRON_SECRET;
  const isUpstash = !!request.headers.get('upstash-signature');
  const isAuthorized = isUpstash || authHeader === `Bearer ${cronSecret}` || (!!cronSecret && secret === cronSecret);
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = makeSupabase();
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  try {
    const sources = await gatherSources(supabase);
    const total = sources.state.length + sources.district.length;
    if (!total) return NextResponse.json({ status: 'skipped', message: 'No news sources available.' });

    const { parsed, provider } = await runAI(buildPrompt(sources), buildPrompt(sources, true));
    const activities = sanitize(parsed.activities);
    if (!activities.length) return NextResponse.json({ status: 'failed', error: 'AI returned zero activities', provider }, { status: 500 });

    if (searchParams.get('dry') === '1') {
      return NextResponse.json({ status: 'dry-run', provider, source_count: total, activities });
    }

    let { data, error } = await supabase.from('leader_activities').insert(activities).select('id');
    if (error && (error.code === '42703' || error.message?.includes('issue_domain'))) {
      // Migration 015 not applied yet — retry without the new column
      const retry = await supabase.from('leader_activities').insert(activities.map(({ issue_domain, ...r }) => r)).select('id');
      if (retry.error) throw retry.error;
      data = retry.data;
      console.warn('[leadership] issue_domain column missing — saved without it. Run migration 015.');
    } else if (error) {
      throw error;
    }
    const leadersUpdated = await updateLeaders(supabase, activities);

    console.log(`[leadership] ${data?.length} activities, ${leadersUpdated} leaders (provider=${provider}).`);
    return NextResponse.json({ status: 'success', provider, inserted: data?.length || 0, leaders_updated: leadersUpdated, activities });
  } catch (err) {
    console.error('[leadership] ERROR:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) { return handle(request); }
export async function POST(request) { return handle(request); }

