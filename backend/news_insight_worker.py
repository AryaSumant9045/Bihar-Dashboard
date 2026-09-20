import os
import json
import time
from datetime import datetime, timezone
import requests
import feedparser
from flask import Flask, render_template_string, jsonify, request
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from groq import Groq

load_dotenv()

app = Flask(__name__)

# Supabase Credentials
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    supabase = None
    print("Supabase URL or Key is missing in environment variables.", flush=True)

# AI Clients Initialization
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY")) if os.getenv("GEMINI_API_KEY") else None
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

# PlugSky Configurations
PLUGSKY_API_URL = os.getenv("PLUGSKY_API_URL", "https://api.plugsky.com/v1")
PLUGSKY_MODEL = os.getenv("PLUGSKY_MODEL", "plugsky-micro")
PLUGSKY_API_KEY = os.getenv("PLUGSKY_API_KEY")

SYSTEM_PROMPT = """आप BJP Bihar War Room के लिए एक Senior Political Intelligence Analyst AI हैं।

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
- Health score या trend को बिना ठोस आधार के मनमाने ढंग से न बदलें"""

# Free-model token discipline
MAX_OUTPUT_TOKENS = 2000

def parse_ai_json_response(raw_text):
    if not raw_text:
        return None
    try:
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()
        return json.loads(cleaned)
    except (json.JSONDecodeError, IndexError) as e:
        print(f"JSON parse failed: {e}\nRaw text was: {raw_text[:300]}...", flush=True)
        return None

def get_prev_cycle_context():
    """Compact previous-cycle context for trend comparison (~300 tokens max)."""
    if not supabase:
        return ""
    try:
        res = supabase.table("news_insights").select(
            "overall_situation, overall_political_health_score, political_risks"
        ).order("created_at", desc=True).limit(1).execute()
        prev = res.data[0] if res.data else None
        if not prev or not prev.get("overall_situation"):
            return ""
        score = (prev.get("overall_political_health_score") or {}).get("score")
        risks = prev.get("political_risks") or []
        risk_names = ", ".join([r.get("issue", "") for r in risks[:5] if isinstance(r, dict) and r.get("issue")])
        ctx = "## पिछले Cycle का Summary (तुलना के लिए):\n"
        ctx += f"Overall situation: {str(prev['overall_situation'])[:500]}\n"
        if score is not None:
            ctx += f"Health score: {score}\n"
        if risk_names:
            ctx += f"मुख्य risks: {risk_names}\n"
        return ctx + "\n"
    except Exception as e:
        # Column missing (migration 014 not applied) or other fetch issue — proceed without context
        print(f"[WARN] Prev-cycle context unavailable: {e}", flush=True)
        return ""

def generate_ai_insight_from_rendered_news(rendered_news_list):
    if not rendered_news_list:
        return None

    headlines_text = "\\n".join(
        [f"- [{item.get('district', 'General')}] {item['heading']}" for item in rendered_news_list]
    )
    prev_context = get_prev_cycle_context()
    user_content = f"{prev_context}## इस Cycle की {len(rendered_news_list)} News Headlines:\\n\\n{headlines_text}"

    # 1. Primary Engine: Gemini
    if gemini_client:
        try:
            print("Analyzing UI Rendered News via Gemini AI...", flush=True)
            model_name = os.getenv("GEMINI_API_MODEL", "gemini-2.5-flash")
            prompt = f"{SYSTEM_PROMPT}\\n\\n{user_content}"

            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={
                    "temperature": 0.3,
                    "maxOutputTokens": MAX_OUTPUT_TOKENS,
                    "responseMimeType": "application/json",
                }
            )
            parsed = parse_ai_json_response(response.text)
            if parsed:
                print("Successfully analyzed UI news using Gemini!", flush=True)
                return parsed
            print("Gemini response parse nahi hua, Groq fallback try करेंगे...", flush=True)
        except Exception as e:
            print(f"Gemini Error: {e}. Fallback to Groq...", flush=True)

    # 2. Fallback Engine 1: Groq
    if groq_client:
        try:
            print("Analyzing UI Rendered News via Groq AI (Fallback 1)...", flush=True)
            completion = groq_client.chat.completions.create(
                model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.3,
                max_tokens=MAX_OUTPUT_TOKENS,
                response_format={"type": "json_object"}
            )
            parsed = parse_ai_json_response(completion.choices[0].message.content)
            if parsed:
                print("Successfully analyzed UI news using Groq!", flush=True)
                return parsed
            print("Groq response parse nahi hua, PlugSky fallback try karenge...", flush=True)
        except Exception as e:
            print(f"Groq Error: {e}. Fallback to PlugSky...", flush=True)

    # 3. Fallback Engine 2: PlugSky
    if PLUGSKY_API_KEY:
        try:
            print("Analyzing UI Rendered News via PlugSky AI (Fallback 2)...", flush=True)
            endpoint = f"{PLUGSKY_API_URL.rstrip('/')}/chat/completions"
            headers = {
                "Authorization": f"Bearer {PLUGSKY_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": PLUGSKY_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                "temperature": 0.3,
                "max_tokens": MAX_OUTPUT_TOKENS,
                "response_format": {"type": "json_object"}
            }
            res = requests.post(endpoint, headers=headers, json=payload, timeout=30)
            if res.status_code == 200:
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                parsed = parse_ai_json_response(content)
                if parsed:
                    print("Successfully analyzed UI news using PlugSky!", flush=True)
                    return parsed
                print("PlugSky response parse nahi hua.", flush=True)
            else:
                print(f"PlugSky API error ({res.status_code}): {res.text[:200]}", flush=True)
        except Exception as e:
            print(f"PlugSky Fallback Error: {e}", flush=True)

    print("Teeno AI engines (Gemini, Groq, PlugSky) fail ho gaye.", flush=True)
    return None

def fetch_and_save_to_db():
    feed_sources = [
        {"name": "Google News", "url": os.getenv("GOOGLE_NEWS_RSS_URL")},
        {"name": "Dainik Bhaskar", "url": os.getenv("BHASKAR_BIHAR_RSS_URL")},
        {"name": "Live Hindustan", "url": os.getenv("HINDUSTAN_BIHAR_RSS_URL")},
    ]

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

    inserted_count = 0
    if not supabase:
        print("Supabase not initialized, cannot fetch and save to db", flush=True)
        return 0

    for source in feed_sources:
        if not source["url"]:
            continue

        for attempt in range(3):
            try:
                res = session.get(source["url"], timeout=15)
                if res.status_code == 200:
                    feed = feedparser.parse(res.content)
                    for entry in feed.entries:
                        title = getattr(entry, "title", "").strip()
                        if not title:
                            continue

                        try:
                            existing = supabase.table("bihar_news").select("id").eq("heading", title).execute()
                            if not existing.data:
                                supabase.table("bihar_news").insert({
                                    "heading": title,
                                    "content": getattr(entry, "summary", getattr(entry, "description", "")),
                                    "district": source["name"]
                                }).execute()
                                inserted_count += 1
                                print(f"[{source['name']}] Inserted: {title}", flush=True)
                        except Exception as db_err:
                            print(f"Supabase DB error on article '{title[:20]}...': {db_err}", flush=True)

                    break
            except requests.exceptions.RequestException as e:
                print(f"[{source['name']}] RSS fetch attempt {attempt + 1} failed: {e}", flush=True)
                time.sleep(1)

    return inserted_count

def save_insight_to_supabase(insight_dict, news_count):
    if not supabase:
        print("Supabase not initialized, cannot save insight", flush=True)
        return
        
    payload = {
        "overall_situation": insight_dict.get("overall_situation"),
        "bjp_action_points": insight_dict.get("bjp_action_points", []),
        "bjp_advantage_points": insight_dict.get("bjp_advantage_points", []),
        "political_risks": insight_dict.get("political_risks", []),
        "opposition_activity": insight_dict.get("opposition_activity", []),
        "counter_strategy_points": insight_dict.get("counter_strategy_points", []),
        "election_watch_items": insight_dict.get("election_watch_items", []),
        "overall_political_health_score": insight_dict.get("overall_political_health_score"),
        "trend_since_last_cycle": insight_dict.get("trend_since_last_cycle"),
        "top_priority_today": insight_dict.get("top_priority_today", []),
        "most_active_opposition_voices_this_cycle": insight_dict.get("most_active_opposition_voices_this_cycle", []),
        "data_quality": insight_dict.get("data_quality"),
        "news_count": news_count,
    }
    try:
        supabase.table("news_insights").insert(payload).execute()
        print("Structured insight saved to news_insights table!", flush=True)
    except Exception as e:
        # Migration 014 columns missing? Retry with base fields so the cycle isn't lost.
        print(f"Full payload insert failed ({e}). Retrying with base fields...", flush=True)
        base_payload = {k: v for k, v in payload.items() if k in {
            "overall_situation", "bjp_action_points", "political_risks", "opposition_activity",
            "counter_strategy_points", "election_watch_items", "news_count"
        }}  # bjp_advantage_points v नए intel columns migration 014 के बाद ही save होते हैं
        try:
            supabase.table("news_insights").insert(base_payload).execute()
            print("Base insight saved (run migration 014 for new intel columns).", flush=True)
        except Exception as e2:
            print(f"Error saving insight to supabase: {e2}", flush=True)

def should_generate_insight(hours_threshold=8):  # Production setting: 8 hours (3x daily)
    if not supabase:
        print("[ERROR] Supabase not initialized.", flush=True)
        return False
    try:
        insight_res = supabase.table("news_insights").select("created_at").order("created_at", desc=True).limit(1).execute()
        if not insight_res.data:
            print("[INFO] No previous insights found. Will generate a new one.", flush=True)
            return True
        
        last_created_str = insight_res.data[0]['created_at']
        last_created_dt = datetime.fromisoformat(last_created_str.replace('Z', '+00:00'))
        now_utc = datetime.now(timezone.utc)
        
        diff_hours = (now_utc - last_created_dt).total_seconds() / 3600
        if diff_hours >= hours_threshold:
            print(f"[INFO] Latest insight is {diff_hours:.2f} hours old (threshold is {hours_threshold}). Generating new...", flush=True)
            return True
        else:
            print(f"[SKIP] Latest insight is only {diff_hours:.2f} hours old. Skipping generation.", flush=True)
            return False
    except Exception as e:
        print(f"[ERROR] Timestamp check error: {e}", flush=True)
        return True

@app.route("/api/cron", methods=["GET", "POST"])
def cron_job():
    print("[CRON] Executing Cron job via API...", flush=True)
    inserted_news = fetch_and_save_to_db()
    insight_created = False
    if should_generate_insight():
        print("[INFO] Triggering AI insight generation from API...", flush=True)
        if supabase:
            ui_news_response = supabase.table("bihar_news").select("heading, district").order("created_at", desc=True).limit(50).execute()
            ui_news_list = ui_news_response.data if ui_news_response else []
            if ui_news_list:
                insight_result = generate_ai_insight_from_rendered_news(ui_news_list)
                if insight_result:
                    save_insight_to_supabase(insight_result, len(ui_news_list))
                    insight_created = True

    return jsonify({"status": "success", "inserted_articles": inserted_news, "insight_generated": insight_created}), 200

if __name__ == "__main__":
    import threading
    def run_cron_periodically():
        # Wait a few seconds for Next.js to fully start before spamming logs
        time.sleep(3)
        while True:
            try:
                print("\n" + "="*50, flush=True)
                print("[DB] Checking for new news articles to fetch...", flush=True)
                inserted_news = fetch_and_save_to_db()
                if inserted_news > 0:
                    print(f"[DB] {inserted_news} news articles fetched and saved to DB.", flush=True)
                else:
                    print("[DB] No new articles found. DB is up to date.", flush=True)
                
                if should_generate_insight():
                    print("[GEMINI] Gemini is analyzing the top news headlines...", flush=True)
                    if supabase:
                        ui_news_response = supabase.table("bihar_news").select("heading, district").order("created_at", desc=True).limit(50).execute()
                        ui_news_list = ui_news_response.data if ui_news_response else []
                        if ui_news_list:
                            try:
                                insight_result = generate_ai_insight_from_rendered_news(ui_news_list)
                                if insight_result:
                                    print("[GEMINI] Analysis completed!", flush=True)
                                    save_insight_to_supabase(insight_result, len(ui_news_list))
                                else:
                                    print("[ERROR] Gemini analysis failed or returned empty result.", flush=True)
                            except Exception as ai_err:
                                print(f"[ERROR] Gemini analysis threw an exception: {ai_err}", flush=True)
                        else:
                            print("[ERROR] No news found in DB to analyze.", flush=True)
            except Exception as e:
                print(f"[ERROR] Background thread encountered an error: {e}", flush=True)
            
            print("[INFO] Waiting for next cycle...\n", flush=True)
            time.sleep(300) # Check every 5 minutes

    print("[SYSTEM] Starting background worker thread for news insights...", flush=True)
    worker = threading.Thread(target=run_cron_periodically, daemon=True)
    worker.start()
    
    # Try running Flask on an obscure port to avoid crashing the whole script
    FLASK_PORT = 5001
    print(f"[SYSTEM] Starting Flask app on port {FLASK_PORT}...", flush=True)
    try:
        app.run(debug=False, port=FLASK_PORT, host="0.0.0.0")
    except Exception as e:
        print(f"[WARNING] Flask failed to start on port {FLASK_PORT}: {e}", flush=True)
        print("[SYSTEM] Background thread will continue running without the Flask API.", flush=True)
        # Keep the main thread alive so the daemon thread doesn't die
        while True:
            time.sleep(1000)
