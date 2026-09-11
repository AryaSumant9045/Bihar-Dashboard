import Parser from 'rss-parser';

const parser = new Parser();
const RSS_FEEDS = {
    bhaskar: ['Bhaskar Bihar News', 'https://www.bhaskar.com/rss-v1--category-3679.xml'],
    livehindustan: ['LiveHindustan Bihar News', 'https://api.livehindustan.com/feeds/rss/bihar/rssfeed.xml']
};
const LIVEHINDUSTAN_DISTRICTS = {
    patna: 'पटना', bhagalpur: 'भागलपुर', muzaffarpur: 'मुजफ्फरपुर', ara: 'आरा', begusarai: 'बेगूसराय',
    biharsharif: 'बिहारशरीफ', buxar: 'बक्सर', chapra: 'छपरा', gopalganj: 'गोपालगंज', hajipur: 'हाजीपुर',
    jahanabad: 'जहानाबाद', siwan: 'सीवान', gaya: 'गया', aurangabad: 'औरंगाबाद', bhabua: 'भभुआ', nawada: 'नवादा',
    sasaram: 'सासाराम', banka: 'बांका', araria: 'अररिया', katihar: 'कटिहार', khagaria: 'खगड़िया', kishanganj: 'किशनगंज',
    madhepura: 'मधेपुरा', munger: 'मुंगेर', purnia: 'पूर्णिया', saharsa: 'सहरसा', lakhisarai: 'लखीसराय', jamui: 'जमुई',
    supaul: 'सुपौल', darbhanga: 'दरभंगा', madhubani: 'मधुबनी', bagaha: 'बगहा', bettiah: 'बेतिया', motihari: 'मोतिहारी',
    samastipur: 'समस्तीपुर', sitamarhi: 'सीतामढ़ी'
};

function getFeed(source) {
    if (source === 'bhaskar' || source === 'livehindustan') return RSS_FEEDS[source];
    if (source.startsWith('livehindustan-')) {
        const slug = source.slice('livehindustan-'.length);
        const district = LIVEHINDUSTAN_DISTRICTS[slug];
        if (district) return [`LiveHindustan ${district} News`, `https://api.livehindustan.com/feeds/rss/bihar/${slug}/rssfeed.xml`];
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
