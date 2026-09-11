import { getSupabase } from './supabase';

const GEMINI_SYSTEM_PROMPT = `आप BJP Bihar War Room के लिए एक Political Intelligence Summarizer AI हैं।

## आपका काम
War Room के "Breaking News" module के लिए, incoming news/video content से एक "Short Executive Summary" तैयार करना — जो President और War Room team 60-90 सेकंड में पूरा dashboard scan करते समय 5 सेकंड में पढ़ सकें।

## Summary बनाने के सख्त नियम

1. **Headline से बिल्कुल अलग होना चाहिए** — Headline सिर्फ "क्या हुआ" बताता है। Summary में content से निकाला गया EXTRA specific detail होना चाहिए जो headline में नहीं है (जैसे: सटीक आंकड़े, कितने districts/लोग प्रभावित, प्रशासन ने क्या कदम उठाए, अगला क्या होने वाला है)। अगर summary सिर्फ headline को दोबारा लिखना है, तो वो गलत summary है।

2. **लंबाई: अधिकतम 25-30 शब्द, 1-2 पंक्तियाँ** — पूरा article/paragraph कभी न दें।

3. **सिर्फ तथ्य (facts), राय (opinion) नहीं** — कोई speculation, prediction, या political commentary शामिल न करें, सिर्फ जो article में स्पष्ट रूप से लिखा है वही बताएं।

4. **District/Location specific रखें** — अगर article में कोई district/इलाका mention है, उसे summary में ज़रूर शामिल करें।

5. **Neutral tone** — किसी भी पार्टी/नेता के पक्ष या विपक्ष में झुकाव न दिखे, चाहे article का tone कैसा भी हो।

6. **अगर article में summary बनाने लायक पर्याप्त जानकारी नहीं है** (सिर्फ headline जैसा छोटा content है), तो summary field में "Summary pending — insufficient detail in source" लिखें।

## GOOD/BAD Examples

GOOD summary (headline-se-different, specific facts):
- "44 लाख से ज़्यादा लोग प्रभावित, कोसी-गंगा खतरे के निशान से ऊपर; NDRF की 5 टीमें तैनात, राहत शिविर शुरू"
- "पटना में विपक्ष ने बेरोजगारी पर प्रदर्शन किया, पुलिस ने 18 कार्यकर्ताओं को हिरासत में लिया"
- "गया में नई सड़क परियोजना का उद्घाटन, 12 गांवों को सीधा आवागमन लाभ"

BAD summary (headline copy या long paragraph):
- "बिहार में बाढ़ से भागलपुर और चंपारण में हालात बिगड़े" ← यह headline की copy है
- "बिहार के 14 जिलों में लगभग 44 लाख आबादी बाढ़ से प्रभावित है। इस बीच भागलपुर के तटबंध पर भारी बारिश और कोसी नदी के दबाव के कारण मुश्किल..." ← यह बहुत लंबा है
- "नेता ने अपने लंबे भाषण में सरकार की नीतियों पर विस्तार से चर्चा की।" ← कोई specific fact नहीं

## JSON Output Format (हर item के लिए)
केवल valid JSON लौटाएं, कोई markdown या extra text नहीं।

Required fields:
- module: "Breaking News" / "Opposition Tracker" / "Prashant Kishor Tracker" / "Leadership Tracker" / "Media & Social Pulse" / "Issues & Grievances"
- district: specific district नाम, या "Multiple", या "General"
- who: मुख्य व्यक्ति/संगठन का नाम
- event_type: घटना का प्रकार (rally, arrest, flood, statement, protest, etc.)
- issue: मुख्य मुद्दा
- public_statement: कोई सार्वजनिक बयान अगर हो, वरना null
- public_reach_indicator: estimated reach (e.g. "5,000 लोग", "Statewide", "Not mentioned")
- factual_context_needed: true/false
- priority: "Critical" / "Developing" / "Watch" / "Routine"
- priority_reason: priority का कारण (1 sentence)
- summary: 25-30 शब्दों का headline-से-अलग, specific executive summary — या "Summary pending — insufficient detail in source"
- summary_confidence: "high" (जब content में नई specific detail है) / "low" (जब content सिर्फ headline जैसा है)
- source_reliability: "Verified" / "Needs Verification" / "Unverified"`;
const MODULE_MAP = { 'Breaking News': 'Breaking News', 'Opposition Tracker': 'Opposition Tracker', 'Prashant Kishor Tracker': 'PK Tracker', 'Leadership Tracker': 'Leadership Tracker', 'Media & Social Pulse': 'Media Pulse', 'Issues & Grievances': 'General' };
const VALID_MODULES = new Set(Object.values(MODULE_MAP));
const VALID_PRIORITIES = new Set(['Critical', 'Developing', 'Watch', 'Routine']);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function isTransient(error) { return /(?:Gemini|PlugSky).* (429|5\d\d)|429|500|502|503|504|overloaded|rate|quota/i.test(error.message || ''); }

function parseAnalysis(text) {
    const start = text.indexOf('{'); const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('AI provider returned no JSON object');
    return JSON.parse(text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
}

export function validateSummary(summary, title) {
    const value = typeof summary === 'string' ? summary.trim() : '';
    if (!value) {
        console.warn(`AI did not generate a summary for: ${title || 'untitled item'}`);
        return { summary: null, needsReview: true, errorType: 'missing_summary' };
    }
    /* AI explicitly flagged insufficient source content — pass through as-is, no further validation */
    if (value.toLowerCase().startsWith('summary pending')) {
        return { summary: value, needsReview: false, errorType: null };
    }
    const similarity = summarySimilarity(value, title);
    if (similarity >= 0.8) {
        console.warn(`AI summary is ${Math.round(similarity * 100)}% similar to its title; flagging for review`);
        return { summary: value, needsReview: true, errorType: 'summary_matches_title', similarity };
    }
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    if (wordCount > 35) {
        console.warn(`AI summary exceeds 35 words (${wordCount}); flagging for review`);
        return { summary: value, needsReview: true, errorType: 'summary_too_long', wordCount };
    }
    return { summary: value, needsReview: false, errorType: null };
}

function summarySimilarity(left, right) {
    const a = String(left || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/gi, '');
    const b = String(right || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/gi, '');
    if (!a || !b) return 0;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
        const current = [row];
        for (let column = 1; column <= b.length; column += 1) {
            current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1));
        }
        previous.splice(0, previous.length, ...current);
    }
    return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export async function logAnalysisError(supabase, { rawItemId, analyzedItemId = null, errorType, message, details = {} }) {
    const { error } = await supabase.from('analysis_errors').insert({ raw_item_id: rawItemId, analyzed_item_id: analyzedItemId, error_type: errorType, message, details });
    if (error) console.error('Could not write analysis error log:', error.message);
}

export async function generateExecutiveSummary(item) {
    let analysis;
    try {
        analysis = await analyzeWithGemini(item);
    } catch (geminiError) {
        console.warn(`Gemini unavailable for ${item.id || item.title}; trying PlugSky fallback:`, geminiError.message);
        analysis = await analyzeWithPlugSky(item);
    }
    return validateSummary(analysis.summary, item.title);
}

async function analyzeWithGemini(item) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');
    let lastError;
    for (let attempt = 0; attempt <= 3; attempt += 1) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemInstruction: { parts: [{ text: GEMINI_SYSTEM_PROMPT }] }, contents: [{ parts: [{ text: `Article Title: ${item.title}\nArticle Content: ${item.content || 'N/A'}` }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 350, responseMimeType: 'application/json' } }),
                cache: 'no-store', signal: AbortSignal.timeout(20000)
            });
            if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
            const data = await response.json();
            return parseAnalysis(data.candidates?.[0]?.content?.parts?.[0]?.text || '');
        } catch (error) {
            lastError = error;
            if (!isTransient(error) || attempt === 3) break;
            await sleep(1000 * (2 ** attempt));
        }
    }
    throw lastError || new Error('Gemini analysis failed');
}

async function analyzeWithPlugSky(item) {
    const apiKey = process.env.PLUGSKY_API_KEY;
    if (!apiKey) throw new Error('PLUGSKY_API_KEY not set');
    const endpoint = `${(process.env.PLUGSKY_API_URL || 'https://api.plugsky.com/v1').replace(/\/$/, '')}/chat/completions`;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: process.env.PLUGSKY_MODEL || 'plugsky-micro',
            messages: [
                { role: 'system', content: GEMINI_SYSTEM_PROMPT },
                { role: 'user', content: `Article Title: ${item.title}\nArticle Content: ${item.content || 'N/A'}` }
            ],
            temperature: 0.1,
            response_format: { type: 'json_object' }
        }),
        cache: 'no-store', signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`PlugSky error: ${response.status}`);
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map(part => part.text || '').join('') : content || '';
    return parseAnalysis(text);
}

async function analyzeOne(supabase, item) {
    try {
        const { data: existingAnalyses, error: existingError } = await supabase.from('analyzed_items').select('id').eq('raw_item_id', item.id).limit(1);
        if (existingError) throw new Error(existingError.message);
        if (existingAnalyses?.length) {
            await supabase.from('raw_items').update({ gemini_processed: true, processing: false, processing_started_at: null }).eq('id', item.id);
            return { processed: 0, failed: 0, duplicate: 1 };
        }
        let analysis;
        try {
            analysis = await analyzeWithGemini(item);
        } catch (geminiError) {
            console.warn(`Gemini unavailable for ${item.id}; trying PlugSky fallback:`, geminiError.message);
            analysis = await analyzeWithPlugSky(item);
        }
        const module = MODULE_MAP[analysis.module] || (VALID_MODULES.has(analysis.module) ? analysis.module : 'General');
        const priority = VALID_PRIORITIES.has(analysis.priority) ? analysis.priority : 'Watch';
        const summaryResult = validateSummary(analysis.summary, item.title);
        const summaryConfidence = analysis.summary_confidence === 'low' ? 'low' : 'high';
        const { data: analyzed, error: insertError } = await supabase.from('analyzed_items').insert({ raw_item_id: item.id, module, district: analysis.district || 'General', who: analysis.who, event_type: analysis.event_type, issue: analysis.issue, public_statement: analysis.public_statement || null, public_reach_indicator: analysis.public_reach_indicator || 'Not mentioned', factual_context_needed: analysis.factual_context_needed === true || analysis.factual_context_needed === 'true', priority, priority_reason: analysis.priority_reason || 'Unclear from source', source_reliability: analysis.source_reliability || 'Needs Verification', summary: summaryResult.summary, summary_needs_review: summaryResult.needsReview, summary_confidence: summaryConfidence, status: 'नया' }).select('id').single();
        if (insertError && !/duplicate key|unique constraint/i.test(insertError.message)) throw new Error(insertError.message);
        if (summaryResult.errorType) await logAnalysisError(supabase, { rawItemId: item.id, analyzedItemId: analyzed?.id, errorType: summaryResult.errorType, message: `Summary validation: ${summaryResult.errorType}`, details: { title: item.title, similarity: summaryResult.similarity || null, wordCount: summaryResult.wordCount || null } });
        if (['Critical', 'Developing'].includes(priority) && analyzed?.id) await supabase.from('alerts').insert({ analyzed_item_id: analyzed.id, priority, title: item.title.slice(0, 300), summary: summaryResult.summary, district: analysis.district || 'General', module, is_read: false });
        const { error: updateError } = await supabase.from('raw_items').update({ gemini_processed: true, processing: false, processing_started_at: null }).eq('id', item.id);
        if (updateError) throw new Error(updateError.message);
        return { processed: 1, failed: 0 };
    } catch (error) {
        console.error(`Error analyzing item ${item.id}:`, error.message);
        await logAnalysisError(supabase, { rawItemId: item.id, errorType: 'analysis_failed', message: error.message });
        await supabase.from('raw_items').update({ processing: false, processing_started_at: null }).eq('id', item.id);
        return { processed: 0, failed: 1 };
    }
}

export async function runAnalysisCycle({ batchSize = Number(process.env.ANALYSIS_BATCH_SIZE || 20), trigger = 'scheduler' } = {}) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const startedAt = new Date().toISOString();

    /* ── Claim unprocessed items without needing the claim_raw_items() stored procedure ── */
    const safeBatch = Math.min(Math.max(Number(batchSize) || 20, 1), 30);
    const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago

    /* Step 1: Select candidates */
    const { data: candidates, error: selectError } = await supabase
        .from('raw_items')
        .select('id, title, content, url, source_name, source_type, raw_fetched_at')
        .eq('gemini_processed', false)
        .or(`processing.eq.false,processing_started_at.lt.${staleThreshold}`)
        .order('raw_fetched_at', { ascending: true })
        .limit(safeBatch);

    if (selectError) throw new Error(selectError.message);
    const candidateIds = (candidates || []).map(r => r.id);

    if (!candidateIds.length) {
        return { claimed: 0, processed: 0, failed: 0, completed_at: new Date().toISOString() };
    }

    /* Step 2: Mark them as processing */
    await supabase
        .from('raw_items')
        .update({ processing: true, processing_started_at: new Date().toISOString() })
        .in('id', candidateIds);

    const claimed = candidates || [];
    console.info(`Cycle started: ${claimed.length} pending items found`);
    let processed = 0; let failed = 0;
    for (const item of claimed) {
        if (processed + failed > 0) await sleep(1500);
        const result = await analyzeOne(supabase, item);
        processed += result.processed; failed += result.failed;
    }
    const completedAt = new Date().toISOString();
    try {
        await supabase.from('processing_logs').insert({ trigger, started_at: startedAt, completed_at: completedAt, claimed: claimed.length, processed, failed });
    } catch (_) { /* processing_logs insert failure is non-fatal */ }
    console.info(`Cycle completed: ${processed} processed, ${failed} failed`);
    return { claimed: claimed.length, processed, failed, completed_at: completedAt };
}