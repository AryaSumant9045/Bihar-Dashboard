import Parser from 'rss-parser';

const FEED_URL = 'https://fetchrss.com/feed/1x37QR7qqGaQ1x37Qc0ePC1r.rss';
const parser = new Parser();

export async function GET() {
    try {
        const response = await fetch(FEED_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error(`FetchRSS returned ${response.status}`);
        const xml = await response.text();
        const feed = await parser.parseString(xml);

        return Response.json({
            title: feed.title || 'FetchRSS Live Feed',
            link: feed.link || FEED_URL,
            updated_at: new Date().toISOString(),
            items: (feed.items || []).slice(0, 12).map(item => ({
                title: item.title || 'Latest update',
                link: item.link || FEED_URL,
                description: item.contentSnippet || item.content || '',
                image: item.enclosure?.url || item.image?.url || null,
                published_at: item.isoDate || item.pubDate || null,
                author: item.creator || item.author || 'FetchRSS'
            }))
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return Response.json({
            title: 'FetchRSS Live Feed',
            link: FEED_URL,
            updated_at: null,
            items: [],
            message: 'FetchRSS feed is temporarily unavailable.'
        }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
}
