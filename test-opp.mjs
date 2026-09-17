import Parser from 'rss-parser';
const rssParser = new Parser({ timeout: 10000 });
const url = 'https://news.google.com/rss/search?q=%22Jan+Suraaj%22+when:4d&hl=hi&gl=IN&ceid=IN:hi';
try {
  const feed = await rssParser.parseURL(url);
  console.log('RSS Success, items:', feed.items.length);
} catch (e) {
  console.error('RSS Error:', e.message);
}
