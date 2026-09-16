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

SYSTEM_PROMPT = """
आप Bihar politics के एक Senior Political Analyst और BJP Strategy Expert हैं। आपको 
50 news headlines/summaries दी जाएंगी। इनका विश्लेषण करके एक structured "News Insight 
Report" तैयार करें।

## सख्त नियम
1. सिर्फ दिए गए headlines के facts पर आधारित रहें — कोई speculation न करें जो article 
   में स्पष्ट न हो।
2. Tone: Professional, direct, action-oriented, politically sharp — पर हमेशा factual 
   आधार पर, बेबुनियाद दावे नहीं।
3. Opposition के बारे में भी factual/neutral भाषा रखें — description दें, defame न करें।
4. अगर headlines में किसी section के लिए पर्याप्त data नहीं है, तो उस field में 
   "इस बैच में कोई उल्लेखनीय जानकारी नहीं मिली" लिखें, खाली मत छोड़ें और न ही बनावटी 
   content भरें।
5. सिर्फ नीचे दिए JSON structure में जवाब दें — कोई markdown fencing (```json), कोई 
   preamble, कोई extra text नहीं। पहला character सीधे { होना चाहिए।

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
"""

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

def generate_ai_insight_from_rendered_news(rendered_news_list):
    if not rendered_news_list:
        return None

    headlines_text = "\\n".join(
        [f"- [{item.get('district', 'General')}] {item['heading']}" for item in rendered_news_list]
    )
    user_content = f"Yahan Website UI par render hone wali Top News Headlines hain:\\n\\n{headlines_text}"

    # 1. Primary Engine: Gemini
    if gemini_client:
        try:
            print("Analyzing UI Rendered News via Gemini AI...", flush=True)
            model_name = os.getenv("GEMINI_API_MODEL", "gemini-2.5-flash")
            prompt = f"{SYSTEM_PROMPT}\\n\\n{user_content}"

            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt
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
                temperature=0.5,
                max_tokens=1500
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
                "temperature": 0.5,
                "max_tokens": 1500
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
        "political_risks": insight_dict.get("political_risks", []),
        "opposition_activity": insight_dict.get("opposition_activity", []),
        "counter_strategy_points": insight_dict.get("counter_strategy_points", []),
        "election_watch_items": insight_dict.get("election_watch_items", []),
        "news_count": news_count,
    }
    try:
        supabase.table("news_insights").insert(payload).execute()
        print("Structured insight saved to news_insights table!", flush=True)
    except Exception as e:
        print(f"Error saving insight to supabase: {e}", flush=True)

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
