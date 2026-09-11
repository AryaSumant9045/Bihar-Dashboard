import { createClient } from '@supabase/supabase-js';

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.argv.includes('--apply') && !serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for --apply; dry-run does not need it');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const apply = process.argv.includes('--apply');

function normaliseTitle(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/gi, ' ').trim().replace(/\s+/g, ' ');
}

function similar(left, right) {
    if (left === right) return true;
    const leftWords = new Set(left.split(' ').filter(word => word.length > 2));
    const rightWords = new Set(right.split(' ').filter(word => word.length > 2));
    const overlap = [...leftWords].filter(word => rightWords.has(word)).length;
    return overlap / Math.max(leftWords.size, rightWords.size, 1) >= 0.8;
}

const { data: items, error } = await supabase.from('raw_items').select('id,title,url,source_name,raw_fetched_at').order('raw_fetched_at', { ascending: true }).limit(10000);
if (error) throw new Error(error.message);
const groups = [];
for (const item of items || []) {
    const title = normaliseTitle(item.title);
    const group = groups.find(candidate => (item.url && candidate.urls.has(item.url)) || similar(title, candidate.title));
    if (group) {
        group.duplicates.push(item);
        if (item.url) group.urls.add(item.url);
    } else groups.push({ keeper: item, title, urls: new Set(item.url ? [item.url] : []), duplicates: [] });
}
const duplicateGroups = groups.filter(group => group.duplicates.length);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', groups: duplicateGroups.length, duplicateRows: duplicateGroups.reduce((total, group) => total + group.duplicates.length, 0), examples: duplicateGroups.slice(0, 10).map(group => ({ keeper: group.keeper.title, duplicates: group.duplicates.map(item => item.title), sources: group.duplicates.length + 1 })) }, null, 2));

if (!apply) process.exit(0);
for (const group of duplicateGroups) {
    const sourceNames = [...new Set([group.keeper.source_name, ...group.duplicates.map(item => item.source_name)].filter(Boolean))];
    if (sourceNames.length > 1) await supabase.from('raw_items').update({ source_name: `${sourceNames[0]} + ${sourceNames.length - 1} other sources` }).eq('id', group.keeper.id);
    for (const duplicate of group.duplicates) {
        const { data: keeperAnalysis } = await supabase.from('analyzed_items').select('id').eq('raw_item_id', group.keeper.id).limit(1);
        let relinkQuery = supabase.from('analyzed_items').update({ raw_item_id: group.keeper.id }).eq('raw_item_id', duplicate.id);
        if (keeperAnalysis?.length) relinkQuery = supabase.from('analyzed_items').delete().eq('raw_item_id', duplicate.id);
        const { error: relinkError } = await relinkQuery;
        if (relinkError) console.error(`Could not relink ${duplicate.id}:`, relinkError.message);
        const { error: deleteError } = await supabase.from('raw_items').delete().eq('id', duplicate.id);
        if (deleteError) console.error(`Could not delete ${duplicate.id}:`, deleteError.message);
    }
}
console.log('Duplicate cleanup applied. Canonical raw items were preserved.');