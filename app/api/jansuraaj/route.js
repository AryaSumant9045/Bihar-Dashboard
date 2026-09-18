/**
 * app/api/jansuraaj/route.js
 * Proxies the official Jan Suraaj website backend (jansuraaj.org is a
 * client-rendered Next.js site; its data lives at jsp-backend-nine.vercel.app).
 * GET /api/jansuraaj → { press: [...], interviews: [...] }
 */

const BACKEND = 'https://jsp-backend-nine.vercel.app/api/media/category';

async function fetchCategory(category) {
  const res = await fetch(`${BACKEND}/${category}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${category} fetch failed: ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : [];
}

function mapItem(item) {
  const isInterview = item.category === 'Interview';
  return {
    id:       item.id,
    title:    item.title || item.titleEn || '',
    titleEn:  item.titleEn || '',
    category: item.category,
    date:     item.date || item.createdAt || null,
    imageUrl: item.imageUrl || null,
    handle:   item.handle || '@jansuraajonline',
    excerpt:  String(item.excerpt || item.content || '').replace(/\s+/g, ' ').trim().slice(0, 220),
    url:      `https://www.jansuraaj.org/media/${isInterview ? 'interview' : 'press-releases'}/${item.slug}`,
  };
}

const byDateDesc = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);

export async function GET() {
  try {
    const [press, interviews] = await Promise.all([
      fetchCategory('PressRelease'),
      fetchCategory('Interview'),
    ]);
    return Response.json({
      press:      press.map(mapItem).sort(byDateDesc),
      interviews: interviews.map(mapItem).sort(byDateDesc),
    });
  } catch (err) {
    return Response.json({ error: err.message, press: [], interviews: [] }, { status: 502 });
  }
}
