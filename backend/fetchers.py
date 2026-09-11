import os
import requests
import feedparser
from datetime import datetime, timezone
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables from .env file
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

# Config
NEWS_DATA_API_KEY = os.getenv("NEWS_DATA_API_KEY")
YOUTUBE_API_KEY   = os.getenv("YOUTUBE_API_KEY")
SUPABASE_URL      = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY      = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")


def get_supabase():
    """Return a Supabase client if credentials are available."""
    if SUPABASE_URL and SUPABASE_KEY:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    return None

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
        ("Google News", "https://news.google.com/rss/search?q=Bihar&hl=hi-IN&gl=IN&ceid=IN:hi"),
        ("Bhaskar Bihar News", "https://www.bhaskar.com/rss-v1--category-3679.xml"),
        ("LiveHindustan Bihar", "https://api.livehindustan.com/feeds/rss/bihar/rssfeed.xml"),
        ("LiveHindustan Patna", "https://api.livehindustan.com/feeds/rss/bihar/patna/rssfeed.xml"),
        ("LiveHindustan Bhagalpur", "https://api.livehindustan.com/feeds/rss/bihar/bhagalpur/rssfeed.xml"),
        ("LiveHindustan Muzaffarpur", "https://api.livehindustan.com/feeds/rss/bihar/muzaffarpur/rssfeed.xml"),
        ("LiveHindustan Ara", "https://api.livehindustan.com/feeds/rss/bihar/ara/rssfeed.xml"),
        ("LiveHindustan Begusarai", "https://api.livehindustan.com/feeds/rss/bihar/begusarai/rssfeed.xml"),
        ("LiveHindustan Biharsharif", "https://api.livehindustan.com/feeds/rss/bihar/biharsharif/rssfeed.xml"),
        ("LiveHindustan Buxar", "https://api.livehindustan.com/feeds/rss/bihar/buxar/rssfeed.xml"),
        ("LiveHindustan Chapra", "https://api.livehindustan.com/feeds/rss/bihar/chapra/rssfeed.xml"),
        ("LiveHindustan Gopalganj", "https://api.livehindustan.com/feeds/rss/bihar/gopalganj/rssfeed.xml"),
        ("LiveHindustan Hajipur", "https://api.livehindustan.com/feeds/rss/bihar/hajipur/rssfeed.xml"),
        ("LiveHindustan Jahanabad", "https://api.livehindustan.com/feeds/rss/bihar/jahanabad/rssfeed.xml"),
        ("LiveHindustan Siwan", "https://api.livehindustan.com/feeds/rss/bihar/siwan/rssfeed.xml"),
        ("LiveHindustan Gaya", "https://api.livehindustan.com/feeds/rss/bihar/gaya/rssfeed.xml"),
        ("LiveHindustan Aurangabad", "https://api.livehindustan.com/feeds/rss/bihar/aurangabad/rssfeed.xml"),
        ("LiveHindustan Bhabua", "https://api.livehindustan.com/feeds/rss/bihar/bhabua/rssfeed.xml"),
        ("LiveHindustan Nawada", "https://api.livehindustan.com/feeds/rss/bihar/nawada/rssfeed.xml"),
        ("LiveHindustan Sasaram", "https://api.livehindustan.com/feeds/rss/bihar/sasaram/rssfeed.xml"),
        ("LiveHindustan Banka", "https://api.livehindustan.com/feeds/rss/bihar/banka/rssfeed.xml"),
        ("LiveHindustan Araria", "https://api.livehindustan.com/feeds/rss/bihar/araria/rssfeed.xml"),
        ("LiveHindustan Katihar", "https://api.livehindustan.com/feeds/rss/bihar/katihar/rssfeed.xml"),
        ("LiveHindustan Khagaria", "https://api.livehindustan.com/feeds/rss/bihar/khagaria/rssfeed.xml"),
        ("LiveHindustan Kishanganj", "https://api.livehindustan.com/feeds/rss/bihar/kishanganj/rssfeed.xml"),
        ("LiveHindustan Madhepura", "https://api.livehindustan.com/feeds/rss/bihar/madhepura/rssfeed.xml"),
        ("LiveHindustan Munger", "https://api.livehindustan.com/feeds/rss/bihar/munger/rssfeed.xml"),
        ("LiveHindustan Purnia", "https://api.livehindustan.com/feeds/rss/bihar/purnia/rssfeed.xml"),
        ("LiveHindustan Saharsa", "https://api.livehindustan.com/feeds/rss/bihar/saharsa/rssfeed.xml"),
        ("LiveHindustan Lakhisarai", "https://api.livehindustan.com/feeds/rss/bihar/lakhisarai/rssfeed.xml"),
        ("LiveHindustan Jamui", "https://api.livehindustan.com/feeds/rss/bihar/jamui/rssfeed.xml"),
        ("LiveHindustan Supaul", "https://api.livehindustan.com/feeds/rss/bihar/supaul/rssfeed.xml"),
        ("LiveHindustan Darbhanga", "https://api.livehindustan.com/feeds/rss/bihar/darbhanga/rssfeed.xml"),
        ("LiveHindustan Madhubani", "https://api.livehindustan.com/feeds/rss/bihar/madhubani/rssfeed.xml"),
        ("LiveHindustan Bagaha", "https://api.livehindustan.com/feeds/rss/bihar/bagaha/rssfeed.xml"),
        ("LiveHindustan Bettiah", "https://api.livehindustan.com/feeds/rss/bihar/bettiah/rssfeed.xml"),
        ("LiveHindustan Motihari", "https://api.livehindustan.com/feeds/rss/bihar/motihari/rssfeed.xml"),
        ("LiveHindustan Samastipur", "https://api.livehindustan.com/feeds/rss/bihar/samastipur/rssfeed.xml"),
        ("LiveHindustan Sitamarhi", "https://api.livehindustan.com/feeds/rss/bihar/sitamarhi/rssfeed.xml")
    ]
    for source_name, feed_url in feeds:
        try:
            feed = feedparser.parse(feed_url)
            for i, entry in enumerate(feed.entries[:10]):
                title = entry.title
                body = entry.get('summary', '')
                combined = f"{title} {body}"
                
                results.append({
                    "id": f"rss_{source_name[:3]}_{i}",
                    "severity": get_severity(combined),
                    "title": title,
                    "body": body[:2000],
                    "source": source_name,
                    "time": "Recent",
                    "category": get_category(combined),
                    "district": get_district(combined),
                    "tags": [],
                    "actionRequired": "Check primary source for details.",
                    "url": entry.get("link", ""),
                    "published_at": entry.get("published", entry.get("updated"))
                })
        except Exception as e:
            print(f"Error fetching {source_name}: {e}")
    return results

def fetch_youtube_news():
    api_key = os.getenv("YOUTUBE_API_KEY")
    results = []

    youtube_channels = {
        "Bihar Tak": "UCnAp2J0bR9b8pM-Avp1GFOQ",
        "News18 Bihar": "UC531MlZA5LUbeGwEN_zcppw",
        "ABP Bihar": "UCz-E4UIPP-4iKn9UKaGBRWA",
        "Zee Bihar": "UCZUjHLJivN0OZPC_Wj8JvkA",
        "Headlines Bihar": "UC3QxziXpEjul0ZpJ71Xbryw",
        "City Post Live": "UC0aPMHsF9pT1KFF5vjf8wEg",
        "Bihari News": "UCqgAJAFCYnfuDyN1r1_nLYA",
        "Today Bihar News": "UCwuGMeQqbeJktOXVXfaF_xw",
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
        } for i, entry in enumerate(feed.entries[:10])]
    
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
                    maxResults=10,
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

def save_raw_items_to_db(items: list) -> int:
    """
    Save fetched news items to raw_items table in Supabase.
    Skips duplicates based on URL (upsert on conflict).
    Returns count of newly saved items.
    """
    supabase = get_supabase()
    if not supabase or not items:
        return 0

    rows = []
    for item in items:
        url = item.get("url", "")
        title = item.get("title", "")
        if not title:
            continue

        source = item.get("source", "Unknown")
        # Determine source_type from source name
        if "YouTube" in source:
            source_type = "youtube"
        elif source in ("NewsData.io",):
            source_type = "news"
        else:
            source_type = "rss"

        rows.append({
            "source_type":  source_type,
            "source_name":  source,
            "title":        title[:500],
            "content":      (item.get("body") or "")[:2000],
            "url":          url or f"https://bihar-command-center.local/raw/{source}/{title}",
            "published_at": None,  # raw Python fetcher doesn't parse publish date
            "gemini_processed": False,
        })

    if not rows:
        return 0

    try:
        # upsert — if URL already exists, skip (on_conflict ignore)
        result = supabase.table("raw_items").upsert(
            rows,
            on_conflict="url",
            ignore_duplicates=True
        ).execute()
        saved = len(result.data) if result.data else 0
        print(f"💾 Saved {saved} new raw_items to Supabase DB")
        return saved
    except Exception as e:
        print(f"❌ Error saving raw_items to DB: {e}")
        return 0


def get_all_live_news(save_to_db: bool = True):
    """
    Fetch news from all sources, optionally save to Supabase raw_items table.
    Returns combined list sorted by severity.
    """
    news_data = fetch_newsdata()
    rss_news  = fetch_rss_news()
    youtube_news = fetch_youtube_news()

    combined = news_data + rss_news + youtube_news

    severity_order = {"high": 0, "medium": 1, "low": 2}
    combined.sort(key=lambda x: severity_order.get(x["severity"], 3))

    for i, item in enumerate(combined):
        item["id"] = i + 1

    # Auto-save to database
    if save_to_db:
        save_raw_items_to_db(combined)

    return combined
