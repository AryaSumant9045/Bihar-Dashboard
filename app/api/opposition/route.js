import Parser from 'rss-parser';

const parser = new Parser();
const OPPOSITION_CHANNELS = {
    'Jan Suraaj': { id: 'UCC0bFdwsgiA-roI9M4DTKXw', party: 'Jan Suraaj' },
    INC: { id: 'UC-qeNGhgJkhWyJ5DGBZJF5w', party: 'INC' },
    RJD: { id: 'UCuK4jszmhyLs-DvHyT3txgA', party: 'RJD' }
};

function districtFor(text) {
    const districts = ['Araria', 'Arwal', 'Aurangabad', 'Banka', 'Begusarai', 'Bhagalpur', 'Bhojpur', 'Buxar', 'Darbhanga', 'Gaya', 'Gopalganj', 'Jamui', 'Jehanabad', 'Kaimur', 'Katihar', 'Khagaria', 'Kishanganj', 'Lakhisarai', 'Madhepura', 'Madhubani', 'Munger', 'Muzaffarpur', 'Nalanda', 'Nawada', 'Patna', 'Purnia', 'Rohtas', 'Saharsa', 'Samastipur', 'Saran', 'Sheikhpura', 'Sheohar', 'Sitamarhi', 'Siwan', 'Supaul', 'Vaishali'];
    return districts.find(district => text.toLowerCase().includes(district.toLowerCase())) || 'Bihar';
}

function statusFor(text) {
    if (/protest|rally|resignation|scam|violence|flood|critical/i.test(text)) return 'critical';
    if (/election|campaign|yatra|meeting|alliance|statement|employment|unemployment/i.test(text)) return 'developing';
    return 'watch';
}

function mapVideo(channelName, party, item, index, idPrefix = 'opp_rss') {
    const title = item.title || `${channelName} latest public update`;
    const description = item.description || item.contentSnippet || item.content || '';
    const combined = `${title} ${description}`;
    return {
        id: `${idPrefix}_${channelName.replace(/\s+/g, '-').toLowerCase()}_${index}`,
        party,
        who: channelName,
        where: districtFor(combined),
        event: 'Public video update',
        issue: 'Public political narrative',
        statement: title,
        reach: 'Video reach pending',
        context: 'Publicly available channel activity; verify claims against primary sources.',
        status: statusFor(combined),
        title,
        summary: description || `Latest public video from ${channelName}.`,
        url: item.link || '',
        published: item.isoDate || item.pubDate || 'Recent',
        source: 'YouTube'
    };
}

async function fetchChannelRss(channelName, { id, party }) {
    const feed = await parser.parseURL(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`);
    return (feed.items || []).slice(0, 10).map((item, index) => mapVideo(channelName, party, item, index));
}

async function fetchChannelApi(channelName, { id, party }, apiKey) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('channelId', id);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('order', 'date');
    url.searchParams.set('maxResults', '10');
    url.searchParams.set('type', 'video');
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
    const items = (await response.json()).items || [];
    if (!items.length) throw new Error(`No videos returned for ${channelName}`);
    return items.map((item, index) => mapVideo(channelName, party, {
        title: item.snippet?.title,
        description: item.snippet?.description,
        link: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : '',
        isoDate: item.snippet?.publishedAt
    }, index, 'opp_api'));
}

export async function GET() {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const channels = await Promise.all(Object.entries(OPPOSITION_CHANNELS).map(async ([channelName, config]) => {
        try {
            const data = apiKey ? await fetchChannelApi(channelName, config, apiKey) : await fetchChannelRss(channelName, config);
            return { channel: channelName, status: 'fulfilled', data };
        } catch {
            try {
                return { channel: channelName, status: 'rss-fallback', data: await fetchChannelRss(channelName, config) };
            } catch {
                return { channel: channelName, status: 'rejected', data: [] };
            }
        }
    }));
    return Response.json({ status: 'success', data: channels.flatMap(result => result.data), channels: channels.map(({ channel, status }) => ({ channel, status })) }, { headers: { 'Cache-Control': 'no-store' } });
}
