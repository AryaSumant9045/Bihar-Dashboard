import os
import requests
import feedparser
from datetime import datetime
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

# Config
NEWS_DATA_API_KEY = os.getenv("NEWS_DATA_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

BIHAR_DISTRICTS = [
    "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar",
    "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar",
    "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda",
    "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar",
    "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"
]

POLITICAL_KEYWORDS = [
    "bjp", "rjd", "jdu", "lojp", "ham", "vip party", "janata dal", "nda", "mahagathbandhan", "indi alliance",
    "election", "chunav", "vidhan sabha", "assembly", "lok sabha", "voter", "campaign", "manifesto", 
    "nitish", "tejashwi", "prashant kishor", "lalu yadav", "chirag", "sushil", "samrat", "manjhi", "pawan singh",
    "minister", "opposition", "rally", "dharna", "yatra", "press conference", "cm nitish", "bihar bjp"
]

def load_env(path=".env"):
    if not os.path.exists(path): return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

load_env()

def get_district(text):
    text_lower = text.lower()
    for d in BIHAR_DISTRICTS:
        if d.lower() in text_lower:
            return d
    return "Multiple"

def get_severity(text):
    text_lower = text.lower()
    critical_words = ["flood", "riot", "resignation", "mega rally", "clash", "protest", "critical", "scam"]
    developing_words = ["alliance", "dissent", "meeting", "viral", "controversy", "replaced"]
    
    for word in critical_words:
        if word in text_lower:
            return "high"
    for word in developing_words:
        if word in text_lower:
            return "medium"
    return "low"

def get_category(text):
    text_lower = text.lower()
    if any(w in text_lower for w in ["flood", "disaster", "rain", "drought", "accident"]):
        return "Flood & Disaster"
    if any(w in text_lower for w in ["alliance", "opposition", "congress", "rjd", "jan suraaj"]):
        return "Opposition"
    if any(w in text_lower for w in ["murder", "riot", "clash", "police", "arrest"]):
        return "Law & Order"
    if any(w in text_lower for w in ["viral", "tweet", "social media", "video"]):
        return "Media"
    if any(w in text_lower for w in ["budget", "economy", "investment", "job", "employment"]):
        return "Economy"
    return "Political"

def fetch_newsdata():
    api_key = os.getenv("NEWS_DATA_API_KEY")
    if not api_key:
        return []
    
    results = []
    try:
        params = {"apikey": api_key, "q": "Bihar", "language": "hi,en", "country": "in"}
        response = requests.get("https://newsdata.io/api/1/news", params=params, timeout=10)
        if response.status_code == 200:
            data = response.json().get("results", [])
            for i, article in enumerate(data):
                title = article.get("title", "")
                body = article.get("description") or article.get("content") or ""
                combined = f"{title} {body}"
                
                results.append({
                    "id": f"nd_{i}",
                    "severity": get_severity(combined),
                    "title": title,
                    "body": body[:200] + "..." if len(body) > 200 else body,
                    "source": "NewsData.io",
                    "time": "Just now",
                    "category": get_category(combined),
                    "district": get_district(combined),
                    "tags": [],
                    "actionRequired": "Monitor and update War Room."
                })
    except Exception as e:
        print(f"Error fetching NewsData: {e}")
    return results

def fetch_rss_news():
    results = []
    feeds = [
        ("Google News", "https://news.google.com/rss/search?q=Bihar&hl=hi-IN&gl=IN&ceid=IN:hi")
    ]
    for source_name, feed_url in feeds:
        try:
            feed = feedparser.parse(feed_url)
            for i, entry in enumerate(feed.entries[:10]):  # Get top 10 from Google News since it's the main aggregator
                title = entry.title
                body = entry.get('summary', '')
                combined = f"{title} {body}"
                
                results.append({
                    "id": f"rss_{source_name[:3]}_{i}",
                    "severity": get_severity(combined),
                    "title": title,
                    "body": "Google News Aggregation.",
                    "source": source_name,
                    "time": "Recent",
                    "category": get_category(combined),
                    "district": get_district(combined),
                    "tags": [],
                    "actionRequired": "Check primary source for details."
                })
        except Exception as e:
            print(f"Error fetching {source_name}: {e}")
    return results

def fetch_youtube_news():
    api_key = os.getenv("YOUTUBE_API_KEY")
    results = []

    youtube_channels = {
        "News18 Bihar": "UC531MlZA5LUbeGwEN_zcppw",
        "ABP Bihar": "UCz-E4UIPP-4iKn9UKaGBRWA",
        "Zee Bihar": "UCZUjHLJivN0OZPC_Wj8JvkA",
        "First Bihar": "UCRP74f4FXxw7ez2iIyUsHSg",
        "Kashish News": "UCBdxSSyIlnwo3Aj5O0c6RWQ",
    }

    def fetch_channel_rss(channel_name, channel_id):
        feed = feedparser.parse(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}")
        return [{
            "id": f"yt_rss_{channel_name[:3]}_{i}",
            "severity": get_severity(entry.title),
            "title": entry.title,
            "body": f"Latest video from {channel_name}.",
            "url": entry.get("link", ""),
            "source": f"YouTube: {channel_name}",
            "time": "Just uploaded",
            "category": "Media",
            "district": get_district(entry.title),
            "tags": ["Video"],
            "actionRequired": "Watch video for potential narrative impact."
        } for i, entry in enumerate(feed.entries[:3])]
    
    if not api_key:
        print("No YOUTUBE_API_KEY found, using YouTube RSS fallback...")
        for channel_name, channel_id in youtube_channels.items():
            results.extend(fetch_channel_rss(channel_name, channel_id))
        return results

    try:
        youtube = build("youtube", "v3", developerKey=api_key)
        for channel_name, channel_id in youtube_channels.items():
            try:
                req = youtube.search().list(
                    channelId=channel_id,
                    part="snippet",
                    order="date",
                    maxResults=3,
                    type="video"
                )
                res = req.execute()
                api_items = res.get("items", [])
                if not api_items:
                    results.extend(fetch_channel_rss(channel_name, channel_id))
                for i, item in enumerate(api_items):
                    snippet = item["snippet"]
                    title = snippet["title"]
                    body = snippet["description"]
                    combined = f"{title} {body}"
                    
                    results.append({
                        "id": f"yt_{channel_name[:3]}_{i}",
                        "severity": get_severity(combined),
                        "title": title,
                        "body": body[:200] + "..." if len(body) > 200 else body,
                        "url": f"https://www.youtube.com/watch?v={item['id']['videoId']}",
                        "source": f"YouTube: {channel_name}",
                        "time": "Just uploaded",
                        "category": "Media",
                        "district": get_district(combined),
                        "tags": ["Video"],
                        "actionRequired": "Watch video for potential narrative impact."
                    })
            except Exception as channel_err:
                print(f"Error fetching channel {channel_name}: {channel_err}")
                results.extend(fetch_channel_rss(channel_name, channel_id))
    except Exception as e:
        print(f"Error initializing YouTube API: {e}")
    return results

def get_all_live_news():
    news_data = fetch_newsdata()
    rss_news = fetch_rss_news()
    youtube_news = fetch_youtube_news()
    
    combined = news_data + rss_news + youtube_news
    
    severity_order = {"high": 0, "medium": 1, "low": 2}
    combined.sort(key=lambda x: severity_order.get(x["severity"], 3))
    
    for i, item in enumerate(combined):
        item["id"] = i + 1
        
    return combined
