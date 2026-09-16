import { NextResponse } from 'next/server';
import Parser from 'rss-parser';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 60; // Allow up to 60 seconds for this function on Vercel
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `
आप Bihar politics के एक Senior Political Analyst और BJP Strategy Expert हैं। आपको 
pichle 8 ghanto ki news headlines/summaries दी जाएंगी। इनका विश्लेषण करके एक structured "News Insight Report" तैयार करें।

## सख्त नियम
1. सिर्फ दिए गए headlines के facts पर आधारित रहें — कोई speculation न करें जो article में स्पष्ट न हो।
2. Tone: Professional, direct, action-oriented, politically sharp — पर हमेशा factual आधार पर, बेबुनियाद दावे नहीं।
3. Opposition के बारे में भी factual/neutral भाषा रखें — description दें, defame न करें।
4. अगर headlines में किसी section के लिए पर्याप्त data नहीं है, तो उस field में "इस बैच में कोई उल्लेखनीय जानकारी नहीं मिली" लिखें, खाली मत छोड़ें और न ही बनावटी content भरें।
5. सिर्फ नीचे दिए JSON structure में जवाब दें — कोई markdown fencing (\`\`\`json), कोई preamble, कोई extra text नहीं। पहला character सीधे { होना चाहिए।

## Output JSON structure


{
  "overall_situation": "3-4 lines — Bihar की मौजूदा राजनीतिक स्थिति का overview",
  "bjp_action_points": ["3-5 bullet points"],
  "political_risks": [
    {"issue": "...", "risk_level": "Critical/High/Medium/Low", "reason": "..."}
  ],
  "opposition_activity": [
    {"party_or_leader": "...", "action_summary": "...", "potential_impact": "High/Medium/Low/None"}
  ],
  "counter_strategy_points": ["3-5 bullet points"],
  "election_watch_items": ["bullet points, ya empty array agar kuch na ho"]
}
`;

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

    // 4. Check time since last insight
    const { data: lastInsight } = await supabase
      .from('news_insights')
      .select('created_at')
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
    
    const headlinesText = uiNews.map(n => `- [${n.district || 'General'}] ${n.heading}`).join('\n');
    const userContent = `Yahan Website UI par render hone wali Top News Headlines hain:\n\n${headlinesText}`;
    const prompt = `${SYSTEM_PROMPT}\n\n${userContent}`;

    let parsedJson = null;
    let aiProvider = 'gemini';

    try {
      const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await aiClient.models.generateContent({
        model: process.env.GEMINI_API_MODEL || 'gemini-2.5-flash',
        contents: prompt,
      });
      parsedJson = extractJson(response.text);
      if (!parsedJson) throw new Error("Gemini returned invalid JSON");
      console.log("[GEMINI] Analysis completed successfully!");
    } catch (geminiError) {
      console.warn(`[GEMINI ERROR] ${geminiError.message}. Falling back to Groq...`);
      try {
        const { Groq } = await import('groq-sdk');
        const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
        
        // Groq has 8000 TPM limit. 150 items = ~6000 tokens.
        const safeGroqNews = uiNews.slice(0, 150);
        const groqText = safeGroqNews.map(n => `- [${n.district || 'General'}] ${n.heading}`).join('\n');
        const groqContent = `Yahan Website UI par render hone wali Top News Headlines hain:\n\n${groqText}`;
        const groqPrompt = `${SYSTEM_PROMPT}\n\n${groqContent}`;

        const groqResponse = await groqClient.chat.completions.create({
          messages: [{ role: 'user', content: groqPrompt }],
          model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
          temperature: 0.5,
          max_tokens: 2500,
          response_format: { type: 'json_object' }
        });
        parsedJson = extractJson(groqResponse.choices[0].message.content);
        if (!parsedJson) throw new Error("Groq returned invalid JSON");
        aiProvider = 'groq';
        console.log(`[GROQ] Analysis completed successfully for ${safeGroqNews.length} items via fallback!`);
        
        // Update news count to reflect what Groq actually processed
        uiNews.length = safeGroqNews.length;
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
              temperature: 0.5,
              max_tokens: 1500
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
      political_risks: parsedJson.political_risks || [],
      opposition_activity: parsedJson.opposition_activity || [],
      counter_strategy_points: parsedJson.counter_strategy_points || [],
      election_watch_items: parsedJson.election_watch_items || [],
      news_count: uiNews.length,
    };

    const { error: insertError } = await supabase.from('news_insights').insert(payload);
    if (insertError) {
      throw insertError;
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
