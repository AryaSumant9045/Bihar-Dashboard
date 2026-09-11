import { getSupabase } from '../../../../lib/supabase';
import { generateExecutiveSummary, logAnalysisError } from '../../../../lib/gemini-analysis';

export const maxDuration = 300;

export async function POST(request) {
    const secret = process.env.SUMMARY_REPROCESS_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const supabase = getSupabase();
    if (!supabase) return Response.json({ error: 'Supabase not configured' }, { status: 500 });
    const { data: items, error } = await supabase.from('analyzed_items').select('id, raw_item_id, summary, raw_items(title, content)').order('created_at', { ascending: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    let updated = 0;
    let failed = 0;
    for (const item of items || []) {
        try {
            const raw = item.raw_items || {};
            const result = await generateExecutiveSummary({ id: item.raw_item_id, title: raw.title || 'Untitled item', content: raw.content });
            const update = await supabase.from('analyzed_items').update({ summary: result.summary, summary_needs_review: result.needsReview }).eq('id', item.id);
            if (update.error) throw new Error(update.error.message);
            if (result.errorType) await logAnalysisError(supabase, { rawItemId: item.raw_item_id, analyzedItemId: item.id, errorType: result.errorType, message: `Summary regeneration: ${result.errorType}`, details: { title: raw.title || null, similarity: result.similarity || null, wordCount: result.wordCount || null } });
            updated += 1;
        } catch (itemError) {
            failed += 1;
            await logAnalysisError(supabase, { rawItemId: item.raw_item_id, analyzedItemId: item.id, errorType: 'summary_regeneration_failed', message: itemError.message });
            console.error(`Summary regeneration failed for ${item.id}:`, itemError.message);
        }
    }
    return Response.json({ status: 'success', total: items?.length || 0, updated, failed });
}