import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env manually
const env = {};
try {
  const lines = readFileSync(resolve(__dirname, '../.env'), 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch (e) { console.warn('Could not load .env:', e.message); }

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ACCOUNTS = [
  { handle: 'jansuraajonline', table: 'xjansuraaj' },
  { handle: 'INCBihar',        table: 'xinc' },
  { handle: 'RahulGandhi',     table: 'xrahulgandi' },
  { handle: 'RJDforIndia',     table: 'xrjd' },
  { handle: 'yadavtejashwi',   table: 'xtejwaniyd' },
];

const RSSHUB = 'https://rsshub-9o9d.onrender.com/twitter/user/';

// Minimal RSS XML parser (no external deps)
function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim() : '';
    };
    items.push({ title: get('title'), link: get('link') || get('guid'), pubDate: get('pubDate') });
  }
  return items;
}

async function seedAccount(handle, table) {
  console.log(`\n🔄 Fetching @${handle}...`);
  try {
    const res = await fetch(`${RSSHUB}${handle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BiharDashboard/2.0)',
        'Accept': 'application/xml, text/xml, */*'
      },
      signal: AbortSignal.timeout(65000),
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const xml = await res.text();
    const items = parseRssItems(xml);
    
    if (!items.length) {
      console.log(`⚠️  @${handle}: No items in feed`);
      return;
    }
    
    console.log(`✅ @${handle}: ${items.length} posts fetched`);
    
    const rows = items.slice(0, 20).map(i => ({
      handle,
      heading: (i.title || '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim().slice(0, 500),
      url: i.link,
      published_at: i.pubDate ? new Date(i.pubDate).toISOString() : null,
    })).filter(r => r.heading);

    const { data, error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'handle,heading', ignoreDuplicates: true })
      .select('id');

    if (error) {
      console.error(`❌ @${handle} Supabase error:`, error.message, error.details);
    } else {
      console.log(`💾 @${handle} → ${table}: ${data?.length || 0} new rows inserted (${rows.length} total processed)`);
    }
  } catch (err) {
    console.error(`❌ @${handle} FAILED:`, err.message);
  }
}

console.log('🚀 X Social Pulse — Seeding Supabase tables...');
console.log('Supabase URL:', SUPABASE_URL?.slice(0,40) + '...');

for (const { handle, table } of ACCOUNTS) {
  await seedAccount(handle, table);
}

console.log('\n🎉 Seed complete!');
