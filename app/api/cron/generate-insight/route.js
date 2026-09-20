import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60; // Allow up to 60 seconds for this function on Vercel
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `आप BJP Bihar War Room के लिए एक Senior Political Intelligence Analyst AI हैं।

आपको News headlines (latest cycle, district tags के साथ) और पिछले cycle का summary (context के लिए, अगर दिया गया हो) दिए जाएंगे। इनका विश्लेषण करके एक comprehensive, decision-ready "Intelligence Report" तैयार करें।

## मुख्य फोकस — BJP-centric विश्लेषण
आपका हर विश्लेषण राजनीतिक रूप से relevant और BJP Bihar के नज़रिए से हो। हर मुद्दे में साफ़ दिखाएं:
- BJP/सरकार/CM image को क्या RISK है (political_risks)
- स्थिति या विपक्ष की कमज़ोरी से BJP का क्या फायदा है (bjp_advantage_points)
- BJP को क्या करना चाहिए — ठोस, actionable कदम (top_priority_today और counter_strategy_points)

## सख्त नियम
1. केवल valid JSON लौटाएं — कोई markdown fencing, backtick, preamble या extra text नहीं। पहला character सीधे { होना चाहिए।
2. CRITICAL: सारी JSON values/content HINDI (Devanagari script) में लिखें — keys English में रहें।
3. सिर्फ दिए गए data के facts पर आधारित रहें — कोई speculation न करें जो headlines में स्पष्ट न हो। Fact और narrative को अलग रखें।
4. Tone: Professional, direct, action-oriented, politically sharp — हमेशा factual आधार पर।
5. Opposition के बारे में factual/neutral भाषा रखें — description दें, defame न करें, कोई derogatory language इस्तेमाल न करें चाहे headlines का tone कैसा भी हो।
6. Internal vulnerabilities कभी न छिपाएं — party/CM image के लिए जो कमज़ोर पक्ष हैं, उन्हें political_risks में brutally honest लेकिन factual तरीके से दिखाएं।
7. अगर किसी section के लिए पर्याप्त data नहीं है, तो text fields में "इस cycle में पर्याप्त जानकारी नहीं मिली" लिखें और arrays में खाली [] दें — बनावटी content न भरें, खाली भी न छोड़ें।
8. Duplicate/overlapping risk items merge करें — अगर दो risks एक ही underlying कारण से जुड़े हैं (जैसे "अपराध" और "सामाजिक असंतोष"), उन्हें एक ही item में अलग-अलग sub-reasons के साथ मिलाएं, अलग items न बनाएं।
9. पिछले cycle के summary से तुलना ज़रूर करें — बताएं क्या नया है, क्या बढ़ा, क्या कम हुआ। अगर पिछला summary context में नहीं दिया गया (पहला cycle है), तो trend_since_last_cycle के तीनों arrays खाली [] छोड़ें, बनावटी तुलना न करें।
10. हर risk/opposition item में source_count/mention_count दें — सिर्फ दी गई headlines से गिनकर, अंदाज़ा न लगाएं।
11. Health score तभी ऊपर/नीचे adjust करें जब कोई ठोस reason headlines में मिले — बेवजह score न बदलें।
12. TOKEN अनुशासन (free model पर चल रहा है): output छोटा और सटीक रखें — political_risks अधिकतम 5 items, opposition_activity अधिकतम 5, bjp_advantage_points अधिकतम 5, top_priority_today अधिकतम 3, most_active_opposition_voices_this_cycle अधिकतम 3, election_watch_items अधिकतम 5, trend_since_last_cycle के प्रति array अधिकतम 3 items। हर reason/action_summary अधिकतम 1-2 lines। affected_districts में अधिकतम 4 जिले (व्यापक होने पर सिर्फ "Bihar-wide")।

## Output सिर्फ इस JSON structure में दें

{
  "overall_situation": "3-4 lines — Bihar की मौजूदा राजनीतिक स्थिति का overview",

  "overall_political_health_score": {
    "score": 0-100 के बीच एक number,
    "trend_arrow": "declining / stable / improving",
    "reason": "1-2 lines — score इस स्तर पर क्यों है, और पिछले cycle से क्यों बदला/नहीं बदला"
  },

  "trend_since_last_cycle": {
    "escalated": ["जो मुद्दे पिछले cycle से बढ़े/बिगड़े"],
    "de_escalated": ["जो मुद्दे पिछले cycle से सुधरे/कम हुए"],
    "new_developments": ["जो बिल्कुल नए मुद्दे इस cycle में आए, पहले नहीं थे"]
  },

  "top_priority_today": [
    {
      "rank": 1,
      "action": "आज सबसे पहले क्या करना चाहिए — specific, actionable",
      "urgency": "Immediate / Within 24 hrs / This week",
      "related_issue": "किस risk/development से जुड़ा है ये action"
    }
  ],

  "bjp_action_points": [
    "BJP/सरकार की तरफ से जो सकारात्मक कदम/उपलब्धियां दिखीं — 3-5 bullet points"
  ],

  "bjp_advantage_points": [
    "हालात या विपक्ष की कमज़ोरी/चूक से BJP को जो राजनीतिक फायदा — सिर्फ अगर data में स्पष्ट संकेत हो, 3-5 bullet points, वरना खाली []"
  ],

  "political_risks": [
    {
      "issue": "मुद्दे का नाम (duplicate/overlapping issues merge करके)",
      "risk_level": "Critical / High / Medium / Low",
      "reason": "क्यों risk है, party/CM image पर क्या असर — voter impact सहित",
      "affected_districts": ["जो district specifically प्रभावित हैं, या 'Bihar-wide' अगर व्यापक है"],
      "source_count": "कितनी headlines ने इसे cover किया (number)"
    }
  ],

  "opposition_activity": [
    {
      "party_or_leader": "नाम",
      "action_summary": "उन्होंने क्या किया/कहा — narrative angle सहित",
      "potential_impact": "High / Medium / Low / None",
      "mention_count": "इस cycle में कितनी बार mention हुआ (number)"
    }
  ],

  "most_active_opposition_voices_this_cycle": [
    {
      "name": "नेता/संगठन का नाम",
      "mentions": "number",
      "dominant_theme": "किस मुद्दे पर सबसे ज़्यादा बोल रहे हैं"
    }
  ],

  "counter_strategy_points": [
    "इन मुद्दों के जवाब में BJP क्या approach ले सकती है — 3-5 factual, actionable, defensible communication points"
  ],

  "election_watch_items": [
    "आगामी चुनाव के नज़रिए से नज़र रखने लायक मुद्दे"
  ],

  "data_quality": {
    "total_sources_analyzed": "कुल कितनी headlines analyze हुईं (number)",
    "verified_news_sources": "verified/trusted sources से कितनी (number)",
    "unverified_flagged": "जिनकी reliability अस्पष्ट है (number)"
  }
}

## जो कभी न करें
- कभी भी अपनी तरफ से कोई negative content किसी नेता/पार्टी के बारे में न गढ़ें
- Headlines में जो न हो उसे "शायद ऐसा हो सकता है" कहकर न जोड़ें
- किसी को defame/discredit करने वाली भाषा इस्तेमाल न करें, चाहे वो opposition का नेता ही क्यों न हो
- राजनीतिक strategy या counter-narrative इस तरह न सुझाएं जो मानहानि या गलत सूचना फैलाने वाली हो — सिर्फ factual, defensible communication approach सुझाएं
- Health score या trend को बिना ठोस आधार के मनमाने ढंग से न बदलें`;

// Free-model token discipline: caps per provider
const MAX_HEADLINES_PRIMARY = 150; // Gemini / PlugSky
const MAX_HEADLINES_GROQ    = 80;  // Groq free tier ~6000 TPM
const MAX_OUTPUT_TOKENS     = 2500;

function extractJson(text) {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      const parts = cleaned.split('```');
      if (parts.length >= 3) {
        cleaned = parts[1].replace(/^json/i, '').trim();
      }
    }
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("JSON parse error:", err);
    return null;
  }
}

export async function POST(request) {
  return handleCron(request);
}

export async function GET(request) {
  return handleCron(request);
}

async function handleCron(request) {
  try {
    // 1. Verify Authorization
    // Allow Upstash QStash, or manual trigger with CRON_SECRET query param/header
    const authHeader = request.headers.get('authorization') || '';
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret') || '';
    const cronSecret = process.env.CRON_SECRET;
    
    // Check if it's from Upstash or manual cron secret
    const isUpstash = request.headers.get('upstash-signature') ? true : false;
    const isAuthorized = isUpstash || authHeader === `Bearer ${cronSecret}` || secret === cronSecret;

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log("[CRON] Starting Serverless AI Insight Generation Cycle...");

    // 2. Initialize Supabase (Service Role to bypass RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Supabase credentials missing");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Fetch RSS Feeds
    const parser = new Parser();
    const feedSources = [
      { name: "Google News", url: process.env.GOOGLE_NEWS_RSS_URL },
      { name: "Dainik Bhaskar", url: process.env.BHASKAR_BIHAR_RSS_URL },
      { name: "Live Hindustan", url: process.env.HINDUSTAN_BIHAR_RSS_URL },
    ];

    let insertedCount = 0;
    
    for (const source of feedSources) {
      if (!source.url) continue;
      try {
        const feed = await parser.parseURL(source.url);
        for (const item of feed.items) {
          if (!item.title) continue;
          
          // Check if exists
          const { data: existing } = await supabase
            .from('bihar_news')
            .select('id')
            .eq('heading', item.title.trim())
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabase.from('bihar_news').insert({
              heading: item.title.trim(),
              content: item.contentSnippet || item.content || item.summary || '',
              district: source.name
            });
            insertedCount++;
          }
        }
      } catch (err) {
        console.error(`Error fetching RSS ${source.name}:`, err.message);
      }
    }
    
    console.log(`[DB] ${insertedCount} new articles fetched and saved.`);

    // 4. Fetch last insight — used both for timing check AND as previous-cycle context
    const { data: lastInsight } = await supabase
      .from('news_insights')
      .select('created_at, overall_situation, overall_political_health_score, political_risks')
      .order('created_at', { ascending: false })
      .limit(1);

    if (lastInsight && lastInsight.length > 0) {
      const lastCreated = new Date(lastInsight[0].created_at);
      const hoursDiff = (new Date() - lastCreated) / (1000 * 60 * 60);
      if (hoursDiff < 1) { // 1 hour safety threshold
        // temporarily bypassed for manual testing
        // return NextResponse.json({ 
        //   status: 'skipped', 
        //   message: `Last insight generated ${hoursDiff.toFixed(2)} hours ago. Safety threshold is 1 hr.` 
        // });
      }
    }

    // Compact previous-cycle context (free-model friendly — ~300 tokens max)
    let prevCycleContext = '';
    const prev = lastInsight?.[0];
    if (prev && prev.overall_situation) {
      const prevScore = prev.overall_political_health_score?.score;
      const prevRisks = Array.isArray(prev.political_risks)
        ? prev.political_risks.slice(0, 5).map(r => r.issue).filter(Boolean).join(', ')
        : '';
      prevCycleContext = `## पिछले Cycle का Summary (तुलना के लिए):\n` +
        `Overall situation: ${String(prev.overall_situation).slice(0, 500)}\n` +
        (prevScore != null ? `Health score: ${prevScore}\n` : '') +
        (prevRisks ? `मुख्य risks: ${prevRisks}\n` : '') +
        `\n`;
    }

    // 5. Fetch News from the last 8 hours for AI Analysis
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const { data: uiNews } = await supabase
      .from('bihar_news')
      .select('heading, district')
      .gte('created_at', eightHoursAgo)
      .order('created_at', { ascending: false });

    if (!uiNews || uiNews.length === 0) {
      return NextResponse.json({ status: 'success', message: 'No new news in the last 8 hours to analyze.' });
    }

    // Optional: Log token usage estimation (approx 15 tokens per headline)
    const estimatedTokens = uiNews.length * 15;
    console.log(`[GEMINI] Fetching ${uiNews.length} news items for analysis. Estimated tokens: ${estimatedTokens} (Well below 250k TPM limit).`);

    // 6. Generate Insight via AI (Gemini with Groq fallback)
    console.log("[GEMINI] Analyzing UI Rendered News via Gemini AI...");

    // Free-model token discipline: cap headlines sent for analysis
    const analysisNews = uiNews.slice(0, MAX_HEADLINES_PRIMARY);

    const headlinesText = analysisNews.map(n => `- [${n.district || 'General'}] ${n.heading}`).join('\n');
    const userContent = `${prevCycleContext}## इस Cycle की ${analysisNews.length} News Headlines:\n\n${headlinesText}`;
    const prompt = `${SYSTEM_PROMPT}\n\n${userContent}`;

    let parsedJson = null;
    let aiProvider = 'gemini';
    let analyzedCount = analysisNews.length;

    try {
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await aiClient.models.generateContent({
        model: process.env.GEMINI_API_MODEL || 'gemini-2.5-flash',
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      });
      parsedJson = extractJson(response.text);
      if (!parsedJson) throw new Error("Gemini returned invalid JSON");
      console.log("[GEMINI] Analysis completed successfully!");
    } catch (geminiError) {
      console.warn(`[GEMINI ERROR] ${geminiError.message}. Falling back to Groq...`);
      try {
        const { Groq } = await import('groq-sdk');
        const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });

        // Groq free tier ~6000 TPM — keep input+output well under it
        const safeGroqNews = uiNews.slice(0, MAX_HEADLINES_GROQ);
        const groqText = safeGroqNews.map(n => `- [${n.district || 'General'}] ${n.heading}`).join('\n');
        const groqContent = `${prevCycleContext}## इस Cycle की ${safeGroqNews.length} News Headlines:\n\n${groqText}`;
        const groqPrompt = `${SYSTEM_PROMPT}\n\n${groqContent}`;

        const groqResponse = await groqClient.chat.completions.create({
          messages: [{ role: 'user', content: groqPrompt }],
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          temperature: 0.3,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        });
        parsedJson = extractJson(groqResponse.choices[0].message.content);
        if (!parsedJson) throw new Error("Groq returned invalid JSON");
        aiProvider = 'groq';
        analyzedCount = safeGroqNews.length;
        console.log(`[GROQ] Analysis completed successfully for ${safeGroqNews.length} items via fallback!`);
      } catch (groqError) {
        console.error(`[GROQ ERROR] ${groqError.message}. Falling back to PlugSky...`);
        try {
          const plugskyRes = await fetch(`${process.env.PLUGSKY_API_URL || 'https://api.plugsky.com/v1'}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.PLUGSKY_API_KEY}`
            },
            body: JSON.stringify({
              model: process.env.PLUGSKY_MODEL || 'plugsky-micro',
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3,
              max_tokens: 2000,
              response_format: { type: 'json_object' }
            })
          });
          const plugskyData = await plugskyRes.json();
          parsedJson = extractJson(plugskyData.choices[0].message.content);
          if (!parsedJson) throw new Error("PlugSky returned invalid JSON");
          aiProvider = 'plugsky';
          console.log("[PLUGSKY] Analysis completed successfully via fallback!");
        } catch (plugskyError) {
          console.error(`[PLUGSKY ERROR] ${plugskyError.message}. No more fallbacks.`);
          throw new Error("All AI engines (Gemini, Groq, PlugSky) failed to analyze the news.");
        }
      }
    }

    // 7. Save insight to Supabase
    const payload = {
      overall_situation: parsedJson.overall_situation || "",
      bjp_action_points: parsedJson.bjp_action_points || [],
      bjp_advantage_points: parsedJson.bjp_advantage_points || [],
      political_risks: parsedJson.political_risks || [],
      opposition_activity: parsedJson.opposition_activity || [],
      counter_strategy_points: parsedJson.counter_strategy_points || [],
      election_watch_items: parsedJson.election_watch_items || [],
      overall_political_health_score: parsedJson.overall_political_health_score || null,
      trend_since_last_cycle: parsedJson.trend_since_last_cycle || null,
      top_priority_today: parsedJson.top_priority_today || [],
      most_active_opposition_voices_this_cycle: parsedJson.most_active_opposition_voices_this_cycle || [],
      data_quality: parsedJson.data_quality || null,
      news_count: analyzedCount,
    };

    let { error: insertError } = await supabase.from('news_insights').insert(payload);
    if (insertError) {
      // Migration 014 columns missing? Retry with base fields so the cycle isn't lost.
      const { overall_political_health_score, trend_since_last_cycle, top_priority_today, most_active_opposition_voices_this_cycle, data_quality, bjp_advantage_points, ...basePayload } = payload;
      const retry = await supabase.from('news_insights').insert(basePayload);
      if (retry.error) throw retry.error;
      console.warn("[DB] New intel columns missing — saved base payload only. Run migration 014.");
    }

    console.log("[DB] Structured insight saved to news_insights table!");

    return NextResponse.json({ 
      status: 'success', 
      inserted_articles: insertedCount,
      insight_generated: true 
    });

  } catch (err) {
    console.error("[CRON ERROR]:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
