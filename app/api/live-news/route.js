import Parser from 'rss-parser';
import { getSupabase } from '../../../lib/supabase';

const parser = new Parser();
const BIHAR_RSS_FEEDS = [
    ['Bhaskar Bihar News', 'https://www.bhaskar.com/rss-v1--category-3679.xml'],
    ['LiveHindustan Bihar', 'https://api.livehindustan.com/feeds/rss/bihar/rssfeed.xml'],
    ['LiveHindustan Patna', 'https://api.livehindustan.com/feeds/rss/bihar/patna/rssfeed.xml'],
    ['LiveHindustan Bhagalpur', 'https://api.livehindustan.com/feeds/rss/bihar/bhagalpur/rssfeed.xml'],
    ['LiveHindustan Muzaffarpur', 'https://api.livehindustan.com/feeds/rss/bihar/muzaffarpur/rssfeed.xml'],
    ['LiveHindustan Ara', 'https://api.livehindustan.com/feeds/rss/bihar/ara/rssfeed.xml'],
    ['LiveHindustan Begusarai', 'https://api.livehindustan.com/feeds/rss/bihar/begusarai/rssfeed.xml'],
    ['LiveHindustan Biharsharif', 'https://api.livehindustan.com/feeds/rss/bihar/biharsharif/rssfeed.xml'],
    ['LiveHindustan Buxar', 'https://api.livehindustan.com/feeds/rss/bihar/buxar/rssfeed.xml'],
    ['LiveHindustan Chapra', 'https://api.livehindustan.com/feeds/rss/bihar/chapra/rssfeed.xml'],
    ['LiveHindustan Gopalganj', 'https://api.livehindustan.com/feeds/rss/bihar/gopalganj/rssfeed.xml'],
    ['LiveHindustan Hajipur', 'https://api.livehindustan.com/feeds/rss/bihar/hajipur/rssfeed.xml'],
    ['LiveHindustan Jahanabad', 'https://api.livehindustan.com/feeds/rss/bihar/jahanabad/rssfeed.xml'],
    ['LiveHindustan Siwan', 'https://api.livehindustan.com/feeds/rss/bihar/siwan/rssfeed.xml'],
    ['LiveHindustan Gaya', 'https://api.livehindustan.com/feeds/rss/bihar/gaya/rssfeed.xml'],
    ['LiveHindustan Aurangabad', 'https://api.livehindustan.com/feeds/rss/bihar/aurangabad/rssfeed.xml'],
    ['LiveHindustan Bhabua', 'https://api.livehindustan.com/feeds/rss/bihar/bhabua/rssfeed.xml'],
    ['LiveHindustan Nawada', 'https://api.livehindustan.com/feeds/rss/bihar/nawada/rssfeed.xml'],
    ['LiveHindustan Sasaram', 'https://api.livehindustan.com/feeds/rss/bihar/sasaram/rssfeed.xml'],
    ['LiveHindustan Banka', 'https://api.livehindustan.com/feeds/rss/bihar/banka/rssfeed.xml'],
    ['LiveHindustan Araria', 'https://api.livehindustan.com/feeds/rss/bihar/araria/rssfeed.xml'],
    ['LiveHindustan Katihar', 'https://api.livehindustan.com/feeds/rss/bihar/katihar/rssfeed.xml'],
    ['LiveHindustan Khagaria', 'https://api.livehindustan.com/feeds/rss/bihar/khagaria/rssfeed.xml'],
    ['LiveHindustan Kishanganj', 'https://api.livehindustan.com/feeds/rss/bihar/kishanganj/rssfeed.xml'],
    ['LiveHindustan Madhepura', 'https://api.livehindustan.com/feeds/rss/bihar/madhepura/rssfeed.xml'],
    ['LiveHindustan Munger', 'https://api.livehindustan.com/feeds/rss/bihar/munger/rssfeed.xml'],
    ['LiveHindustan Purnia', 'https://api.livehindustan.com/feeds/rss/bihar/purnia/rssfeed.xml'],
    ['LiveHindustan Saharsa', 'https://api.livehindustan.com/feeds/rss/bihar/saharsa/rssfeed.xml'],
    ['LiveHindustan Lakhisarai', 'https://api.livehindustan.com/feeds/rss/bihar/lakhisarai/rssfeed.xml'],
    ['LiveHindustan Jamui', 'https://api.livehindustan.com/feeds/rss/bihar/jamui/rssfeed.xml'],
    ['LiveHindustan Supaul', 'https://api.livehindustan.com/feeds/rss/bihar/supaul/rssfeed.xml'],
    ['LiveHindustan Darbhanga', 'https://api.livehindustan.com/feeds/rss/bihar/darbhanga/rssfeed.xml'],
    ['LiveHindustan Madhubani', 'https://api.livehindustan.com/feeds/rss/bihar/madhubani/rssfeed.xml'],
    ['LiveHindustan Bagaha', 'https://api.livehindustan.com/feeds/rss/bihar/bagaha/rssfeed.xml'],
    ['LiveHindustan Bettiah', 'https://api.livehindustan.com/feeds/rss/bihar/bettiah/rssfeed.xml'],
    ['LiveHindustan Motihari', 'https://api.livehindustan.com/feeds/rss/bihar/motihari/rssfeed.xml'],
    ['LiveHindustan Samastipur', 'https://api.livehindustan.com/feeds/rss/bihar/samastipur/rssfeed.xml'],
    ['LiveHindustan Sitamarhi', 'https://api.livehindustan.com/feeds/rss/bihar/sitamarhi/rssfeed.xml']
];
const YOUTUBE_CHANNELS = {
    'Bihar Tak': 'UCnAp2J0bR9b8pM-Avp1GFOQ',
    'News18 Bihar': 'UC531MlZA5LUbeGwEN_zcppw',
    'ABP Bihar': 'UCz-E4UIPP-4iKn9UKaGBRWA',
    'Zee Bihar': 'UCZUjHLJivN0OZPC_Wj8JvkA',
    'Headlines Bihar': 'UC3QxziXpEjul0ZpJ71Xbryw',
    'City Post Live': 'UC0aPMHsF9pT1KFF5vjf8wEg',
    'Bihari News': 'UCqgAJAFCYnfuDyN1r1_nLYA',
    'Today Bihar News': 'UCwuGMeQqbeJktOXVXfaF_xw',
    'First Bihar': 'UCRP74f4FXxw7ez2iIyUsHSg',
    'Kashish News': 'UCBdxSSyIlnwo3Aj5O0c6RWQ'
};

function districtFor(text) {
    const districts = ['Araria', 'Arwal', 'Aurangabad', 'Banka', 'Begusarai', 'Bhagalpur', 'Bhojpur', 'Buxar', 'Darbhanga', 'Gaya', 'Gopalganj', 'Jamui', 'Jehanabad', 'Kaimur', 'Katihar', 'Khagaria', 'Kishanganj', 'Lakhisarai', 'Madhepura', 'Madhubani', 'Munger', 'Muzaffarpur', 'Nalanda', 'Nawada', 'Patna', 'Purnia', 'Rohtas', 'Saharsa', 'Samastipur', 'Saran', 'Sheikhpura', 'Sheohar', 'Sitamarhi', 'Siwan', 'Supaul', 'Vaishali'];
    return districts.find(district => text.toLowerCase().includes(district.toLowerCase())) || 'Multiple';
}

function severityFor(text) {
    if (/flood|riot|resignation|mega rally|clash|protest|critical|scam/i.test(text)) return 'high';
    if (/alliance|dissent|meeting|viral|controversy|replaced/i.test(text)) return 'medium';
    return 'low';
}

async function fetchBiharRss() {
    const feeds = await Promise.allSettled(BIHAR_RSS_FEEDS.map(async ([source, feedUrl]) => {
        const response = await fetch(feedUrl, { cache: 'no-store', headers: { 'user-agent': 'Bihar-Command-Center/1.0' } });
        if (!response.ok) throw new Error(`${source} returned ${response.status}`);
        const feed = await parser.parseString(await response.text());
        return (feed.items || []).slice(0, 10).map(item => {
            const title = item.title || 'Bihar news update';
            const body = item.contentSnippet || item.content || item.summary || '';
            const text = `${title} ${body}`;
            return {
                id: `rss_${source}_${item.guid || item.link || title}`,
                severity: severityFor(text),
                title,
                body,
                url: item.link || `https://www.google.com/search?q=${encodeURIComponent(title)}`,
                source,
                time: 'Recent',
                category: 'Political',
                district: districtFor(text),
                tags: ['Bihar', source.includes('Bhaskar') ? 'Bhaskar' : 'LiveHindustan'],
                published_at: item.isoDate || item.pubDate || null
            };
        });
    }));
    return feeds.filter(result => result.status === 'fulfilled').flatMap(result => result.value);
}

async function fetchNewsData() {
    const apiKey = process.env.NEWS_DATA_API_KEY;
    if (!apiKey) return [];
    const url = new URL('https://newsdata.io/api/1/news');
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('q', 'Bihar');
    url.searchParams.set('language', 'hi,en');
    url.searchParams.set('country', 'in');
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`NewsData.io returned ${response.status}`);
    const results = (await response.json()).results || [];
    return results.map((article, index) => {
        const title = article.title || 'Latest Bihar update';
        const body = article.description || article.content || '';
        return { id: `nd_${index}`, severity: severityFor(`${title} ${body}`), title, body, source: 'NewsData.io', time: 'Just now', district: districtFor(`${title} ${body}`), url: article.link || '', published_at: article.pubDate || null };
    });
}

async function fetchYoutubeRss(channelName, channelId) {
    const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
    return (feed.items || []).slice(0, 10).map((item, index) => ({
        id: `yt_rss_${channelId}_${index}`,
        severity: severityFor(item.title || ''),
        title: item.title || `${channelName} latest video`,
        body: `Latest video from ${channelName}.`,
        url: item.link || '',
        source: `YouTube: ${channelName}`,
        time: 'Just uploaded',
        category: 'Media',
        district: districtFor(item.title || ''),
        tags: ['Video'],
        published_at: item.isoDate || null,
    }));
}

async function fetchYoutube() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const entries = Object.entries(YOUTUBE_CHANNELS);
    const fetchChannel = async ([channelName, channelId]) => {
        try {
            if (!apiKey) throw new Error('YouTube API key is not configured');
            const url = new URL('https://www.googleapis.com/youtube/v3/search');
            url.searchParams.set('key', apiKey);
            url.searchParams.set('channelId', channelId);
            url.searchParams.set('part', 'snippet');
            url.searchParams.set('order', 'date');
            url.searchParams.set('maxResults', '10');
            url.searchParams.set('type', 'video');
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
            const items = (await response.json()).items || [];
            if (!items.length) throw new Error('No videos returned');
            return items.map((item, index) => {
                const snippet = item.snippet || {};
                const text = `${snippet.title || ''} ${snippet.description || ''}`;
                return { id: `yt_${channelId}_${index}`, severity: severityFor(text), title: snippet.title || `${channelName} latest video`, body: snippet.description || '', url: `https://www.youtube.com/watch?v=${item.id.videoId}`, source: `YouTube: ${channelName}`, time: 'Just uploaded', category: 'Media', district: districtFor(text), tags: ['Video'], published_at: snippet.publishedAt || null };
            });
        } catch {
            try {
                return await fetchYoutubeRss(channelName, channelId);
            } catch (error) {
                console.error(`YouTube channel ${channelName} unavailable:`, error.message);
                return [];
            }
        }
    };

    return (await Promise.all(entries.map(fetchChannel))).flat();
}

/**
 * Save fetched items to Supabase raw_items table.
 * Uses upsert on URL to avoid duplicates.
 */
async function saveToDatabase(items) {
    const supabase = getSupabase();
    if (!supabase || !items.length) return 0;

    const rows = items
        .filter(item => item.title)
        .map(item => {
            const source = item.source || 'Unknown';
            const title = (item.title || '').slice(0, 500);
            return {
                source_type: source.startsWith('YouTube') ? 'youtube' : source === 'NewsData.io' ? 'news' : 'rss',
                source_name: source,
                title,
                content: (item.body || '').slice(0, 2000),
                url: item.url || `https://bihar-command-center.local/raw/${encodeURIComponent(source)}/${encodeURIComponent(title)}`,
                published_at: item.published_at || null,
                gemini_processed: false,
            };
        });

    if (!rows.length) return 0;

    try {
        const { data: existing } = await supabase
            .from('raw_items')
            .select('title, url')
            .order('raw_fetched_at', { ascending: false })
            .limit(2000);
        const seenUrls = new Set((existing || []).map(item => item.url).filter(Boolean));
        const seenTitles = (existing || []).map(item => normaliseTitle(item.title));
        const uniqueRows = [];
        for (const row of rows) {
            const titleKey = normaliseTitle(row.title);
            const duplicateTitle = seenTitles.some(existingTitle => titleSimilarity(titleKey, existingTitle) >= 0.8);
            if (seenUrls.has(row.url) || duplicateTitle) continue;
            seenUrls.add(row.url);
            seenTitles.push(titleKey);
            uniqueRows.push(row);
        }
        if (!uniqueRows.length) return 0;
        const { data } = await supabase
            .from('raw_items')
            .upsert(uniqueRows, { onConflict: 'url', ignoreDuplicates: true });
        return data?.length || 0;
    } catch (e) {
        console.error('DB save error:', e.message);
        return 0;
    }
}

function normaliseTitle(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function titleSimilarity(left, right) {
    if (!left || !right) return 0;
    if (left === right) return 1;
    const leftWords = new Set(left.split(' ').filter(word => word.length > 2));
    const rightWords = new Set(right.split(' ').filter(word => word.length > 2));
    const overlap = [...leftWords].filter(word => rightWords.has(word)).length;
    return overlap / Math.max(leftWords.size, rightWords.size, 1);
}

/**
 * Enrich raw news items with Gemini-generated summaries from analyzed_items table.
 * Matches by URL (the unique key used during upsert in saveToDatabase).
 * Items without a matching analyzed entry are returned unchanged.
 */
async function enrichWithGeminiSummaries(supabase, items) {
    if (!supabase || !items.length) return items;
    try {
        const urls = [...new Set(items.map(item => item.url).filter(Boolean))];
        if (!urls.length) return items;

        /* Two-query approach: raw_items by URL → then analyzed_items by raw_item_id */
        const { data: rawRows } = await supabase
            .from('raw_items')
            .select('id, url')
            .in('url', urls.slice(0, 200)); /* Supabase IN limit safety */
        if (!rawRows?.length) return items;

        const rawIdMap = new Map(rawRows.map(r => [r.url, r.id]));
        const rawIds = rawRows.map(r => r.id);

        const { data: analyzedRows } = await supabase
            .from('analyzed_items')
            .select('raw_item_id, summary, priority, district, who, event_type')
            .in('raw_item_id', rawIds)
            .not('summary', 'is', null)
            .neq('summary', '');
        if (!analyzedRows?.length) return items;

        /* Map: raw_item_id → analyzed data */
        const analyzedMap = new Map(analyzedRows.map(a => [a.raw_item_id, a]));

        return items.map(item => {
            const rawId = rawIdMap.get(item.url);
            const analyzed = rawId ? analyzedMap.get(rawId) : null;
            if (!analyzed) return item;
            return {
                ...item,
                gemini_summary: analyzed.summary,
                gemini_priority: analyzed.priority,
                gemini_district: analyzed.district,
                gemini_who: analyzed.who,
                gemini_event_type: analyzed.event_type,
            };
        });
    } catch (e) {
        console.warn('enrichWithGeminiSummaries failed (non-fatal):', e.message);
        return items;
    }
}

export async function GET() {
    const [newsResult, youtubeResult, rssResult] = await Promise.allSettled([fetchNewsData(), fetchYoutube(), fetchBiharRss()]);
    const rawData = [
        ...(newsResult.status === 'fulfilled' ? newsResult.value : []),
        ...(youtubeResult.status === 'fulfilled' ? youtubeResult.value : []),
        ...(rssResult.status === 'fulfilled' ? rssResult.value : [])
    ];

    /* Save to DB (non-blocking) then enrich with Gemini summaries */
    const dbSaved = await saveToDatabase(rawData).catch(() => 0);
    const supabase = getSupabase();
    const data = await enrichWithGeminiSummaries(supabase, rawData);

    return Response.json(
        { status: 'success', data, db_saved: dbSaved, sources: { news: newsResult.status, youtube: youtubeResult.status, rss: rssResult.status } },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}


