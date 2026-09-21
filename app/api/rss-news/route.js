/**
 * app/api/rss-news/route.js - RSS News API
 * --------------------------------------------------------
 * Yeh endpoint alag-alag districts (zilon) ki RSS feeds ko parse karke laata hai.
 * Yeh frontend ko district-wise news provide karne ke kaam aata hai.
 */

import Parser from 'rss-parser';
import { bhaskarFeedUrl, stateFeedUrl, livehindustanFeedList } from '../../../lib/districts.js';

const parser = new Parser();

/* Feed URLs .env se aate hain (lib/districts.js). */
function getFeed(source) {
    if (source === 'bhaskar') return ['Bhaskar Bihar News', bhaskarFeedUrl()];
    if (source === 'livehindustan') return ['LiveHindustan Bihar News', stateFeedUrl()];
    if (source.startsWith('livehindustan-')) {
        const slug = source.slice('livehindustan-'.length);
        const entry = livehindustanFeedList().find((f) => f.slug === slug);
        if (entry) return [`LiveHindustan ${entry.label} News`, entry.url];
    }
    return null;
}

export async function GET(request) {
    const source = new URL(request.url).searchParams.get('source') || '';
    const feedConfig = getFeed(source);
    if (!feedConfig) return Response.json({ status: 'error', message: 'Unsupported RSS source' }, { status: 400 });

    try {
        const response = await fetch(feedConfig[1], {
            cache: 'no-store',
            headers: { 'user-agent': 'Bihar-Command-Center/1.0' }
        });
        if (!response.ok) throw new Error(`RSS source returned ${response.status}`);
        const feed = await parser.parseString(await response.text());
        const data = (feed.items || []).map((item, index) => ({
            id: `${source}_${index}`,
            title: item.title || 'Untitled update',
            summary: item.contentSnippet || item.content || item.summary || '',
            url: item.link || '',
            published: item.isoDate || item.pubDate || 'Recent'
        }));
        return Response.json({ status: 'success', source: feed.title || feedConfig[0], data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return Response.json({ status: 'error', source: feedConfig[0], data: [], message: 'RSS feed is temporarily unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
    }
}
