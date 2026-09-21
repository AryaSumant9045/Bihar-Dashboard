/**
 * lib/districts.js — Single source of truth for Bihar district ⇄ DB table mapping.
 * ============================================================
 * Har district ka apna table-pair hai (Supabase me already bane hue):
 *   Raw news  : district_news_<slug>
 *   AI summary: district_summary_<slug>
 *
 * Yeh file do kaam karti hai:
 *   1. LiveHindustan RSS feed slug  →  sahi district slug (table) mapping
 *   2. UI ke district naam (Hindi/English/feed-label) → district slug resolve
 *
 * IMPORTANT: yahan ke slug Supabase ke actual table names se 100% match karte hain.
 * Known gap: district_news_darbhanga / district_summary_darbhanga abhi missing hain
 * (supabase/migrations/016_district_darbhanga_tables.sql run karne par ban jayenge).
 * ============================================================
 */

/**
 * Canonical district registry.
 *   slug    → table suffix (district_news_<slug> / district_summary_<slug>)
 *   hi      → Hindi label used on the War Room / Bihar Map buttons
 *   en      → English name shown in the map/dropdown
 *   feed    → LiveHindustan feed path (…/bihar/<feed>/rssfeed.xml)
 *             null = no dedicated feed (state feed ke saath keyword-filter hota hai)
 *   aliases → alternate spellings legacy UI/code may pass
 */
export const DISTRICTS = [
  { slug: 'patna',          hi: 'पटना',        en: 'Patna',           feed: 'patna',       aliases: [] },
  { slug: 'bhagalpur',      hi: 'भागलपुर',     en: 'Bhagalpur',       feed: 'bhagalpur',   aliases: [] },
  { slug: 'muzaffarpur',    hi: 'मुजफ्फरपुर',  en: 'Muzaffarpur',     feed: 'muzaffarpur', aliases: [] },
  { slug: 'bhojpur',        hi: 'आरा',         en: 'Bhojpur',         feed: 'ara',         aliases: ['Ara', 'Arrah'] },
  { slug: 'begusarai',      hi: 'बेगूसराय',    en: 'Begusarai',       feed: 'begusarai',   aliases: [] },
  { slug: 'bihar_sharif',   hi: 'बिहार शरीफ',  en: 'Biharsharif',     feed: 'biharsharif', aliases: ['Bihar Sharif', 'BiharSharif'] },
  { slug: 'buxar',          hi: 'बक्सर',       en: 'Buxar',           feed: 'buxar',       aliases: [] },
  { slug: 'saran',          hi: 'छपरा',        en: 'Saran',           feed: 'chapra',      aliases: ['Chapra', 'Chhapra'] },
  { slug: 'gopalganj',      hi: 'गोपालगंज',    en: 'Gopalganj',       feed: 'gopalganj',   aliases: [] },
  { slug: 'vaishali',       hi: 'हाजीपुर',     en: 'Vaishali',        feed: 'hajipur',     aliases: ['Hajipur'] },
  { slug: 'jehanabad',      hi: 'जहानाबाद',    en: 'Jehanabad',       feed: 'jahanabad',   aliases: ['Jahanabad'] },
  { slug: 'siwan',          hi: 'सिवान',       en: 'Siwan',           feed: 'siwan',       aliases: ['Sivan'] },
  { slug: 'gaya',           hi: 'गया',         en: 'Gaya',            feed: 'gaya',        aliases: [] },
  { slug: 'aurangabad',     hi: 'औरंगाबाद',    en: 'Aurangabad',      feed: 'aurangabad',  aliases: [] },
  { slug: 'kaimur',         hi: 'भभुआ',        en: 'Kaimur',          feed: 'bhabua',      aliases: ['Bhabua'] },
  { slug: 'nawada',         hi: 'नवादा',       en: 'Nawada',          feed: 'nawada',      aliases: [] },
  { slug: 'rohtas',         hi: 'सासाराम',     en: 'Rohtas',          feed: 'sasaram',     aliases: ['Sasaram'] },
  { slug: 'banka',          hi: 'बांका',       en: 'Banka',           feed: 'banka',       aliases: [] },
  { slug: 'araria',         hi: 'अररिया',      en: 'Araria',          feed: 'araria',      aliases: [] },
  { slug: 'katihar',        hi: 'कटिहार',      en: 'Katihar',         feed: 'katihar',     aliases: [] },
  { slug: 'khagaria',       hi: 'खगड़िया',     en: 'Khagaria',        feed: 'khagaria',    aliases: [] },
  { slug: 'kishanganj',     hi: 'किशनगंज',     en: 'Kishanganj',      feed: 'kishanganj',  aliases: [] },
  { slug: 'madhepura',      hi: 'मधेपुरा',     en: 'Madhepura',       feed: 'madhepura',   aliases: [] },
  { slug: 'munger',         hi: 'मुंगेर',      en: 'Munger',          feed: 'munger',      aliases: [] },
  { slug: 'purnia',         hi: 'पूर्णिया',    en: 'Purnia',          feed: 'purnia',      aliases: ['Purnea'] },
  { slug: 'saharsa',        hi: 'सहरसा',       en: 'Saharsa',         feed: 'saharsa',     aliases: [] },
  { slug: 'lakhisarai',     hi: 'लखीसराय',     en: 'Lakhisarai',      feed: 'lakhisarai',  aliases: [] },
  { slug: 'jamui',          hi: 'जमुई',        en: 'Jamui',           feed: 'jamui',       aliases: [] },
  { slug: 'supaul',         hi: 'सुपौल',       en: 'Supaul',          feed: 'supaul',      aliases: [] },
  { slug: 'darbhanga',      hi: 'दरभंगा',      en: 'Darbhanga',       feed: 'darbhanga',   aliases: [] },
  { slug: 'madhubani',      hi: 'मधुबनी',      en: 'Madhubani',       feed: 'madhubani',   aliases: [] },
  { slug: 'west_champaran', hi: 'बगहा',        en: 'West Champaran',  feed: 'bagaha',      aliases: ['Bagaha', 'Bettiah', 'बेतिया'] },
  { slug: 'west_champaran', hi: 'बेतिया',      en: 'West Champaran',  feed: 'bettiah',     aliases: [] },
  { slug: 'east_champaran', hi: 'मोतिहारी',    en: 'East Champaran',  feed: 'motihari',    aliases: ['Motihari'] },
  { slug: 'samastipur',     hi: 'समस्तीपुर',   en: 'Samastipur',      feed: 'samastipur',  aliases: [] },
  { slug: 'sitamarhi',      hi: 'सीतामढ़ी',    en: 'Sitamarhi',       feed: 'sitamarhi',   aliases: [] },
  { slug: 'arwal',          hi: 'अरवल',        en: 'Arwal',           feed: null,          aliases: [] },
  { slug: 'nalanda',        hi: 'नालंदा',      en: 'Nalanda',         feed: null,          aliases: [] },
  { slug: 'sheikhpura',     hi: 'शेखपुरा',     en: 'Sheikhpura',      feed: null,          aliases: [] },
  { slug: 'sheohar',        hi: 'शेओहर',       en: 'Sheohar',         feed: null,          aliases: [] },
];

/** Districts that have a dedicated LiveHindustan feed, in UI button order. */
export const LIVEHINDUSTAN_FEEDS = DISTRICTS.filter((d) => d.feed);

/** Official 38 Bihar district names (kept for backwards compatibility). */
export const BIHAR_DISTRICTS = [
  'Araria', 'Arwal', 'Aurangabad', 'Banka', 'Begusarai', 'Bhagalpur', 'Bhojpur', 'Buxar',
  'Darbhanga', 'East Champaran', 'Gaya', 'Gopalganj', 'Jamui', 'Jehanabad', 'Kaimur', 'Katihar',
  'Khagaria', 'Kishanganj', 'Lakhisarai', 'Madhepura', 'Madhubani', 'Munger', 'Muzaffarpur',
  'Nalanda', 'Nawada', 'Patna', 'Purnia', 'Rohtas', 'Saharsa', 'Samastipur', 'Saran',
  'Sheikhpura', 'Sheohar', 'Sitamarhi', 'Siwan', 'Supaul', 'Vaishali', 'West Champaran',
];

/* One slug can appear twice (west_champaran has Bagaha + Bettiah buttons),
   so the lookup index keeps the first entry per key. */
const BY_LOOKUP = new Map();
function index(key, entry) {
  if (!key) return;
  const k = String(key).trim().toLowerCase();
  if (k && !BY_LOOKUP.has(k)) BY_LOOKUP.set(k, entry);
}
for (const d of DISTRICTS) {
  index(d.slug, d);
  index(d.en, d);
  index(d.hi, d);
  index(d.feed, d);
  for (const a of d.aliases) index(a, d);
}

/** Unique district slugs (deduped west_champaran). */
export const DISTRICT_SLUGS = [...new Set(DISTRICTS.map((d) => d.slug))];

/** Table name helpers. */
export function districtNewsTable(slug) { return `district_news_${slug}`; }
export function districtSummaryTable(slug) { return `district_summary_${slug}`; }

/**
 * Spec-required mapping: district name (any spelling the UI uses) → raw-news table.
 * e.g. "Patna" → "district_news_patna", "Ara" → "district_news_bhojpur"
 */
export const DISTRICT_TABLE_MAP = {};
export const DISTRICT_SUMMARY_TABLE_MAP = {};
for (const d of DISTRICTS) {
  DISTRICT_TABLE_MAP[d.en] = districtNewsTable(d.slug);
  DISTRICT_TABLE_MAP[d.hi] = districtNewsTable(d.slug);
  DISTRICT_TABLE_MAP[d.slug] = districtNewsTable(d.slug);
  if (d.feed) DISTRICT_TABLE_MAP[d.feed] = districtNewsTable(d.slug);
  for (const a of d.aliases) DISTRICT_TABLE_MAP[a] = districtNewsTable(d.slug);
  DISTRICT_SUMMARY_TABLE_MAP[d.en] = districtSummaryTable(d.slug);
  DISTRICT_SUMMARY_TABLE_MAP[d.slug] = districtSummaryTable(d.slug);
}

const STATE_KEYS = ['all', 'bihar', 'state', 'bihar (all)', 'bihar (state level)', 'bihar (राज्य स्तर)'];

/**
 * Resolve any district input (slug / English / Hindi / feed label / alias / 'bihar')
 * to a registry entry. Returns null for state-level ("Bihar" / "all") or unknown input.
 */
export function resolveDistrict(input) {
  if (input === null || input === undefined) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (STATE_KEYS.includes(key)) return null;
  return BY_LOOKUP.get(key) || null;
}

/** District input → news table; null when the input is state-level/unknown. */
export function districtNewsTableFor(input) {
  const entry = resolveDistrict(input);
  return entry ? districtNewsTable(entry.slug) : null;
}

/** District input → summary table; null when the input is state-level/unknown. */
export function districtSummaryTableFor(input) {
  const entry = resolveDistrict(input);
  return entry ? districtSummaryTable(entry.slug) : null;
}

/** Canonical English label for an input, for UI titles. */
export function districtLabel(input) {
  const entry = resolveDistrict(input);
  if (!entry) return 'Bihar (State)';
  return entry.en;
}

/** UI button list (Hindi + English), used to render district grids. */
export function districtButtons() {
  return DISTRICTS.map((d) => ({ slug: d.slug, hi: d.hi, en: d.en, feed: d.feed }));
}

/**
 * Keyword aliases per district slug — district ka naam (Hindi + English) aur
 * uske HQ shehar ke naam. Inse state feed / doosre district feeds me se
 * "cross-mention" news utha kar patli (thin) districts ki table bhari jati hai.
 * (Bahut chhote 3-akshar keywords jaise 'गया'/'आरा' jaan-bujh kar chhode hain —
 *  Hindi me wo common words bhi hain, isliye false match ka risk hai.)
 */
export const DISTRICT_KEYWORDS = {
  patna: ['पटना', 'Patna'],
  bhagalpur: ['भागलपुर', 'Bhagalpur'],
  muzaffarpur: ['मुजफ्फरपुर', 'Muzaffarpur'],
  bhojpur: ['भोजपुर', 'Bhojpur', 'Arrah'],
  begusarai: ['बेगूसराय', 'Begusarai'],
  bihar_sharif: ['बिहार शरीफ', 'बिहारशरीफ', 'Biharsharif', 'Bihar Sharif'],
  buxar: ['बक्सर', 'Buxar'],
  saran: ['सारण', 'Saran', 'छपरा', 'Chapra', 'Chhapra'],
  gopalganj: ['गोपालगंज', 'Gopalganj'],
  vaishali: ['वैशाली', 'Vaishali', 'हाजीपुर', 'Hajipur'],
  jehanabad: ['जहानाबाद', 'Jehanabad', 'Jahanabad'],
  siwan: ['सिवान', 'सीवान', 'Siwan'],
  gaya: ['Gaya', 'Bodh Gaya'],
  aurangabad: ['औरंगाबाद', 'Aurangabad'],
  kaimur: ['कैमूर', 'Kaimur', 'भभुआ', 'Bhabua'],
  nawada: ['नवादा', 'Nawada'],
  rohtas: ['रोहतास', 'Rohtas', 'सासाराम', 'Sasaram'],
  banka: ['बांका', 'Banka'],
  araria: ['अररिया', 'Araria'],
  katihar: ['कटिहार', 'Katihar'],
  khagaria: ['खगड़िया', 'Khagaria'],
  kishanganj: ['किशनगंज', 'Kishanganj'],
  madhepura: ['मधेपुरा', 'Madhepura'],
  munger: ['मुंगेर', 'Munger'],
  purnia: ['पूर्णिया', 'Purnia', 'Purnea'],
  saharsa: ['सहरसा', 'Saharsa'],
  lakhisarai: ['लखीसराय', 'Lakhisarai'],
  jamui: ['जमुई', 'Jamui'],
  supaul: ['सुपौल', 'Supaul'],
  darbhanga: ['दरभंगा', 'Darbhanga'],
  madhubani: ['मधुबनी', 'Madhubani'],
  west_champaran: ['पश्चिम चंपारण', 'West Champaran', 'बगहा', 'Bagaha', 'बेतिया', 'Bettiah'],
  east_champaran: ['पूर्वी चंपारण', 'East Champaran', 'मोतिहारी', 'Motihari'],
  samastipur: ['समस्तीपुर', 'Samastipur'],
  sitamarhi: ['सीतामढ़ी', 'Sitamarhi'],
  arwal: ['अरवल', 'Arwal'],
  nalanda: ['नालंदा', 'Nalanda', 'राजगीर', 'Rajgir'],
  sheikhpura: ['शेखपुरा', 'Sheikhpura'],
  sheohar: ['शिवहर', 'Sheohar'],
};

/** Fallback keywords for a slug (3-akshar wale ambiguous words hata kar). */
export function districtFallbackKeywords(slug) {
  return (DISTRICT_KEYWORDS[slug] || []).filter((k) => [...String(k)].length >= 4);
}

/** Google News RSS query naam — district ka proper Hindi naam (HQ city nahi). */
export function districtQueryName(slug) {
  const kws = DISTRICT_KEYWORDS[slug] || [];
  return kws[0] || String(slug).replace(/_/g, ' ');
}
