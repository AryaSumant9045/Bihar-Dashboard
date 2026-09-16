import os
import json
import time
import threading
import requests
import feedparser
from flask import Flask, render_template_string
from dotenv import load_dotenv
from supabase import create_client, Client
from google import genai
from groq import Groq

load_dotenv()

app = Flask(__name__)

# Supabase Credentials
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# AI Clients Initialization
gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY")) if os.getenv("GEMINI_API_KEY") else None
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY")) if os.getenv("GROQ_API_KEY") else None

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

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="hi">
<head>
    <meta charset="UTF-8">
    <title>Bihar News & Political Insights Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; background: #0f172a; margin: 0; padding: 20px; color: #f8fafc; }
        .container { max-width: 950px; margin: 0 auto; }
        h2 { color: #f97316; }
        .section-card { background: #1e293b; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 5px solid #f97316; }
        .section-card h3 { color: #f97316; margin-top: 0; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
        .bullet-list { margin: 0; padding-left: 20px; line-height: 1.8; }
        .risk-item, .opp-item { background: #0f172a; padding: 10px 14px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #ef4444; }
        .risk-item.medium, .opp-item.medium { border-left-color: #f59e0b; }
        .risk-item.low, .opp-item.low { border-left-color: #22c55e; }
        .risk-level-badge { font-size: 11px; font-weight: bold; padding: 2px 8px; border-radius: 4px; background: #ef4444; color: white; }
        .news-card { background: white; color: #1e293b; padding: 15px 20px; border-radius: 8px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .badge { background: #2563eb; color: white; padding: 3px 8px; border-radius: 4px; font-size: 12px; }
        .date { color: #888; font-size: 12px; margin-top: 5px; }
        .timestamp { color: #94a3b8; font-size: 12px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>🔥 Live BJP Strategy & Political Insight Dashboard</h2>

        {% if latest_insight %}
        <p class="timestamp">Last analysis: {{ latest_insight.created_at }} ({{ latest_insight.news_count }} headlines analyzed)</p>

        <div class="section-card">
            <h3>📌 Overall Situation Summary</h3>
            <p>{{ latest_insight.overall_situation }}</p>
        </div>

        <div class="section-card">
            <h3>✅ BJP Strategic Action & Improvements</h3>
            <ul class="bullet-list">
                {% for point in latest_insight.bjp_action_points %}
                <li>{{ point }}</li>
                {% endfor %}
            </ul>
        </div>

        <div class="section-card">
            <h3>⚠️ Political Risks & Weak Points</h3>
            {% for risk in latest_insight.political_risks %}
            <div class="risk-item {{ risk.risk_level|lower }}">
                <span class="risk-level-badge">{{ risk.risk_level }}</span>
                <strong>{{ risk.issue }}</strong>
                <p style="margin: 4px 0 0;">{{ risk.reason }}</p>
            </div>
            {% endfor %}
        </div>

        <div class="section-card">
            <h3>🎯 Opposition Strategy (RJD/Congress/Others)</h3>
            {% for opp in latest_insight.opposition_activity %}
            <div class="opp-item {{ opp.potential_impact|lower }}">
                <strong>{{ opp.party_or_leader }}</strong> — {{ opp.action_summary }}
                <p style="margin: 4px 0 0; font-size: 12px; color: #94a3b8;">
                    Potential impact: {{ opp.potential_impact }}
                </p>
            </div>
            {% endfor %}
        </div>

        <div class="section-card">
            <h3>🛡️ Counter Strategy for BJP</h3>
            <ul class="bullet-list">
                {% for point in latest_insight.counter_strategy_points %}
                <li>{{ point }}</li>
                {% endfor %}
            </ul>
        </div>

        {% if latest_insight.election_watch_items %}
        <div class="section-card">
            <h3>🗳️ Election Watch Items</h3>
            <ul class="bullet-list">
                {% for item in latest_insight.election_watch_items %}
                <li>{{ item }}</li>
                {% endfor %}
            </ul>
        </div>
        {% endif %}

        {% else %}
        <div class="section-card"><p>Political Insights generate ho rahe hain, kripya thoda wait karein...</p></div>
        {% endif %}

        <h2>📰 Recent Bihar Headlines</h2>
        {% for item in news_list %}
        <div class="news-card">
            <span class="badge">{{ item.district }}</span>
            <div style="margin-top: 8px;"><strong>{{ item.heading }}</strong></div>
            <div class="date">{{ item.created_at }}</div>
        </div>
        {% endfor %}
    </div>
</body>
</html>
"""


def parse_ai_json_response(raw_text):
    """
    AI (Gemini/Groq) se aaya raw text ko clean karke JSON parse karta hai.
    Markdown fencing (```json ... ```) ko bhi handle karta hai.
    Return: parsed dict, ya None agar parsing fail ho.
    """
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
        print(f"JSON parse failed: {e}\nRaw text was: {raw_text[:300]}...")
        return None


def generate_ai_insight_from_rendered_news(rendered_news_list):
    """
    News list se headlines nikal kar AI se structured JSON insight generate karwata hai.
    Return: parsed dict (structured insight) ya None agar dono engines fail ho jayein.
    """
    if not rendered_news_list:
        return None

    headlines_text = "\n".join(
        [f"- [{item.get('district', 'General')}] {item['heading']}" for item in rendered_news_list]
    )
    user_content = f"Yahan Website UI par render hone wali Top News Headlines hain:\n\n{headlines_text}"

    # 1. Primary Engine: Gemini
    if gemini_client:
        try:
            print("Analyzing UI Rendered News via Gemini AI...")
            model_name = os.getenv("GEMINI_API_MODEL", "gemini-2.5-flash")
            prompt = f"{SYSTEM_PROMPT}\n\n{user_content}"

            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt
            )
            parsed = parse_ai_json_response(response.text)
            if parsed:
                print("Successfully analyzed UI news using Gemini!")
                return parsed
            print("Gemini response parse nahi hua, Groq fallback try karenge...")
        except Exception as e:
            print(f"Gemini Error: {e}. Fallback to Groq...")

    # 2. Fallback Engine: Groq
    if groq_client:
        try:
            print("Analyzing UI Rendered News via Groq AI (Fallback)...")
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
                print("Successfully analyzed UI news using Groq!")
                return parsed
            print("Groq response bhi parse nahi hua.")
        except Exception as e:
            print(f"Groq Fallback Error: {e}")

    return None


def fetch_and_save_to_db():
    feed_sources = [
        {"name": "Google News", "url": os.getenv("GOOGLE_NEWS_RSS_URL")},
        {"name": "Dainik Bhaskar", "url": os.getenv("BHASKAR_BIHAR_RSS_URL")},
        {"name": "Live Hindustan", "url": os.getenv("HINDUSTAN_BIHAR_RSS_URL")},
    ]

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})

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
                                print(f"[{source['name']}] Inserted: {title}")
                        except Exception as db_err:
                            print(f"Supabase DB error on article '{title[:20]}...': {db_err}")
                            time.sleep(1)

                    break
            except requests.exceptions.RequestException as e:
                print(f"[{source['name']}] RSS fetch attempt {attempt + 1} failed: {e}")
                time.sleep(3)


def save_insight_to_supabase(insight_dict, news_count):
    """
    Parsed structured JSON insight ko news_insights table ke sahi columns me save karta hai.
    """
    payload = {
        "overall_situation": insight_dict.get("overall_situation"),
        "bjp_action_points": insight_dict.get("bjp_action_points", []),
        "political_risks": insight_dict.get("political_risks", []),
        "opposition_activity": insight_dict.get("opposition_activity", []),
        "counter_strategy_points": insight_dict.get("counter_strategy_points", []),
        "election_watch_items": insight_dict.get("election_watch_items", []),
        "news_count": news_count,
    }
    supabase.table("news_insights").insert(payload).execute()
    print("Structured insight saved to news_insights table!")


def background_worker():
    insight_counter = 0
    while True:
        print("Starting background news sync...")
        try:
            fetch_and_save_to_db()
        except Exception as e:
            print("Background worker loop error handled:", e)

        # Har 24 hrs par UI data ka Political Insight generate hoga (144 * 10 min = 1440 min = 24 hrs)
        if insight_counter % 144 == 0:
            try:
                ui_news_response = (
                    supabase.table("bihar_news")
                    .select("heading, district")
                    .order("created_at", desc=True)
                    .limit(50)
                    .execute()
                )
                ui_news_list = ui_news_response.data if ui_news_response else []

                if ui_news_list:
                    insight_result = generate_ai_insight_from_rendered_news(ui_news_list)
                    if insight_result:
                        save_insight_to_supabase(insight_result, len(ui_news_list))
                    else:
                        print("Dono AI engines (Gemini + Groq) se insight generate nahi ho paya, is cycle me skip.")
            except Exception as insight_err:
                print("Error in generating insight:", insight_err)

        insight_counter += 1
        time.sleep(600)  # 10 minutes wait


threading.Thread(target=background_worker, daemon=True).start()


@app.route("/")
def home():
    news_res = supabase.table("bihar_news").select("*").order("created_at", desc=True).limit(50).execute()
    rendered_news = news_res.data

    insight_res = supabase.table("news_insights").select("*").order("created_at", desc=True).limit(1).execute()
    latest_insight = insight_res.data[0] if insight_res.data else None

    return render_template_string(HTML_TEMPLATE, news_list=rendered_news, latest_insight=latest_insight)


if __name__ == "__main__":
    app.run(debug=True, port=5000, use_reloader=False)
    