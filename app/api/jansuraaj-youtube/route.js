/**
 * app/api/jansuraaj-youtube/route.js
 * ------------------------------------------------------------
 * Server-side proxy for the official Jan Suraaj YouTube channel.
 * Prefers the YouTube Data API (uploads playlist, 1 quota unit) when
 * YOUTUBE_API_KEY is configured; otherwise falls back to the channel
 * RSS feed (same pattern the FastAPI backend uses).
 * Returns the latest videos + live streams as cards for the PK Tracker.
 *
 * GET /api/jansuraaj-youtube?limit=8
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Official Jan Suraaj channel (youtube.com/@JanSuraaj_)
const CHANNEL_ID = 'UCC0bFdwsgiA-roI9M4DTKXw';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const CHANNEL_URL = 'https://www.youtube.com/@JanSuraaj_';
// Uploads playlist = channel id with the leading "UC" replaced by "UU"
const UPLOADS_PLAYLIST_ID = CHANNEL_ID.replace(/^UC/, 'UU');

async function fetchViaApi(limit) {
  const url = 'https://www.googleapis.com/youtube/v3/playlistItems' +
    `?part=snippet&playlistId=${UPLOADS_PLAYLIST_ID}&maxResults=${limit}` +
    `&key=${encodeURIComponent(process.env.YOUTUBE_API_KEY)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const json = await res.json();
  return (json.items || []).map(item => {
    const sn = item.snippet || {};
    const videoId = (sn.resourceId && sn.resourceId.videoId) || '';
    const thumbs = sn.thumbnails || {};
    return {
      videoId,
      title: sn.title || '',
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '',
      thumbnail: (thumbs.medium || thumbs.high || thumbs.default || {}).url ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
      published: sn.publishedAt || '',
      excerpt: String(sn.description || '').replace(/\s+/g, ' ').slice(0, 180),
    };
  }).filter(v => v.title && v.url);
}

function decode(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function parseEntries(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const grab = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`);
      const found = block.match(r);
      return found ? decode(found[1]) : '';
    };
    const attr = (tag, name) => {
      const r = new RegExp(`<${tag}[^>]*\\s${name}="([^"]*)"`);
      const found = block.match(r);
      return found ? decode(found[1]) : '';
    };
    const videoId = grab('yt:videoId');
    const link = attr('link', 'href') || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
    const thumbnail = attr('media:thumbnail', 'url') ||
      (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
    const title = grab('media:title') || grab('title');
    const description = grab('media:description');
    const published = grab('published') || grab('updated');
    if (!title || !link) continue;
    entries.push({
      videoId,
      title,
      url: link,
      thumbnail,
      published,
      excerpt: description.replace(/\s+/g, ' ').slice(0, 180),
    });
  }
  return entries;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '8', 10) || 8, 30);

  if (process.env.YOUTUBE_API_KEY) {
    try {
      const videos = await fetchViaApi(limit);
      return Response.json({
        channel_id: CHANNEL_ID,
        channel_url: CHANNEL_URL,
        source: 'youtube-api',
        count: videos.length,
        videos,
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      console.warn('[jansuraaj-youtube] API failed, trying RSS:', err.message);
    }
  }

  try {
    const res = await fetch(FEED_URL, {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BiharDashboard/1.0)' },
    });
    if (!res.ok) throw new Error(`YouTube RSS ${res.status}`);
    const xml = await res.text();
    const videos = parseEntries(xml).slice(0, limit);
    return Response.json({
      channel_id: CHANNEL_ID,
      channel_url: CHANNEL_URL,
      source: 'rss',
      count: videos.length,
      videos,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[jansuraaj-youtube] error:', err.message);
    return Response.json({
      error: err.message, channel_url: CHANNEL_URL, count: 0, videos: [],
    }, { status: 502 });
  }
}
