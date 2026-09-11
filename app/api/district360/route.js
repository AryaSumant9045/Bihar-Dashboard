import { getSupabase } from '../../../lib/supabase';

const LIMIT = 20;

export async function GET(request) {
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    const district = new URL(request.url).searchParams.get('district')?.trim();
    if (!district) return Response.json({ error: 'district is required' }, { status: 400 });

    const [analyzedResult, alertsResult, newsResult] = await Promise.all([
        supabase.from('analyzed_items').select(`id, module, district, who, event_type, issue, public_statement, public_reach_indicator, factual_context_needed, priority, priority_reason, source_reliability, summary, status, created_at, raw_items(title, url, source_name, published_at)`).eq('district', district).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('alerts').select('id, priority, title, summary, district, module, is_read, created_at').eq('district', district).order('created_at', { ascending: false }).limit(LIMIT),
        supabase.from('raw_items').select('id, title, content, url, source_name, source_type, published_at, raw_fetched_at').or(`title.ilike.%${district}%,content.ilike.%${district}%`).order('raw_fetched_at', { ascending: false }).limit(LIMIT)
    ]);

    const firstError = analyzedResult.error || alertsResult.error || newsResult.error;
    if (firstError) return Response.json({ error: firstError.message }, { status: 500 });

    const analyzed = analyzedResult.data || [];
    const alerts = alertsResult.data || [];
    const recentNews = newsResult.data || [];
    const breakdown = analyzed.reduce((result, item) => {
        result.priority[item.priority] = (result.priority[item.priority] || 0) + 1;
        result.modules[item.module] = (result.modules[item.module] || 0) + 1;
        return result;
    }, { priority: {}, modules: {} });

    return Response.json({
        status: 'success',
        district,
        summary: { analyzed_items: analyzed.length, alerts: alerts.length, recent_news: recentNews.length },
        breakdown,
        analyzed_items: analyzed,
        alerts,
        recent_news: recentNews
    }, { headers: { 'Cache-Control': 'no-store' } });
}
