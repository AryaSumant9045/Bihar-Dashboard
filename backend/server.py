"""
backend/server.py - FastAPI Backend Server
--------------------------------------------------------
Yeh file FastAPI server ko setup karti hai.
Iska main kaam frontend (React/Next.js) ko APIs provide karna hai 
jisse frontend raw news aur processed items ko fetch kar sake.
"""

from fastapi import FastAPI
from fastapi import HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import feedparser
import os
import sys

# Add current directory to path if running directly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fetchers import get_all_live_news, save_raw_items_to_db
from fetch_x_social import fetch_all_x_accounts
from apscheduler.schedulers.background import BackgroundScheduler
import pytz


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RSS_FEEDS = {
    "bhaskar": ("Bhaskar Bihar News", "https://www.bhaskar.com/rss-v1--category-3679.xml"),
    "livehindustan": ("LiveHindustan Bihar News", "https://api.livehindustan.com/feeds/rss/bihar/rssfeed.xml"),
}

LIVEHINDUSTAN_DISTRICTS = {
    "patna": "पटना", "bhagalpur": "भागलपुर", "muzaffarpur": "मुजफ्फरपुर", "ara": "आरा",
    "begusarai": "बेगूसराय", "biharsharif": "बिहारशरीफ", "buxar": "बक्सर", "chapra": "छपरा",
    "gopalganj": "गोपालगंज", "hajipur": "हाजीपुर", "jahanabad": "जहानाबाद", "siwan": "सीवान",
    "gaya": "गया", "aurangabad": "औरंगाबाद", "bhabua": "भभुआ", "nawada": "नवादा",
    "sasaram": "सासाराम", "banka": "बांका", "araria": "अररिया", "katihar": "कटिहार",
    "khagaria": "खगड़िया", "kishanganj": "किशनगंज", "madhepura": "मधेपुरा", "munger": "मुंगेर",
    "purnia": "पूर्णिया", "saharsa": "सहरसा", "lakhisarai": "लखीसराय", "jamui": "जमुई",
    "supaul": "सुपौल", "darbhanga": "दरभंगा", "madhubani": "मधुबनी", "bagaha": "बगहा",
    "bettiah": "बेतिया", "motihari": "मोतिहारी", "samastipur": "समस्तीपुर", "sitamarhi": "सीतामढ़ी",
}

LIVEHINDUSTAN_FEEDS = {
    "livehindustan": "https://api.livehindustan.com/feeds/rss/bihar/rssfeed.xml",
    **{f"livehindustan-{slug}": f"https://api.livehindustan.com/feeds/rss/bihar/{slug}/rssfeed.xml" for slug in LIVEHINDUSTAN_DISTRICTS},
}

@app.get("/api/live-news")
def live_news():
    """Fetch live news from all sources (also saves to DB)."""
    news = get_all_live_news(save_to_db=True)
    return {"status": "success", "data": news}

@app.get("/api/fetch-and-save")
def fetch_and_save():
    """Fetch news and save raw items to Supabase. Returns save count."""
    news = get_all_live_news(save_to_db=True)
    return {
        "status": "success",
        "message": f"Fetched {len(news)} items and saved new ones to database",
        "total_fetched": len(news),
    }

@app.get("/api/trigger-analysis")
def trigger_analysis(limit: int = Query(20, ge=1, le=100)):
    """Run Gemini AI analysis on unprocessed raw_items."""
    try:
        from gemini_analyzer import run_analysis
        summary = run_analysis(limit=limit)
        return {"status": "success", **summary}
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Gemini analyzer not available: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/rss-news")
def rss_news(source: str = Query(...)):
    if source in LIVEHINDUSTAN_FEEDS:
        slug = source.removeprefix("livehindustan-")
        district = "Bihar" if source == "livehindustan" else LIVEHINDUSTAN_DISTRICTS.get(slug)
        feed_config = district and (f"LiveHindustan {district} News", LIVEHINDUSTAN_FEEDS[source])
    else:
        feed_config = RSS_FEEDS.get(source)
    if not feed_config:
        raise HTTPException(status_code=400, detail="Unsupported RSS source")
    source_name, feed_url = feed_config
    feed = feedparser.parse(feed_url)
    items = [{
        "id": f"{source}_{index}",
        "title": entry.get("title", "Untitled update"),
        "summary": entry.get("summary", ""),
        "url": entry.get("link", ""),
        "published": entry.get("published", "Recent"),
    } for index, entry in enumerate(feed.entries)]
    return {"status": "success", "source": source_name, "data": items}


@app.get("/api/x-social")
def trigger_x_social_fetch():
    """Trigger parallel fetch of 5 X (Twitter) accounts via RSSHub."""
    # Start in background if we don't want to block, but for cron we can just return it.
    # We will run it directly. Vercel will call this and might disconnect, but Python will finish it.
    results = fetch_all_x_accounts()
    return {"status": "success", "data": results}

# Mount the static frontend directory (which is the parent directory of backend)
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/", StaticFiles(directory=base_dir, html=True), name="static")


# Configure APScheduler for 3x daily fetch (5:00 AM, 4:00 PM, 9:00 PM IST)
def start_scheduler():
    ist = pytz.timezone('Asia/Kolkata')
    scheduler = BackgroundScheduler(timezone=ist)
    
    # 5:00 AM IST
    scheduler.add_job(fetch_all_x_accounts, 'cron', hour=5, minute=0)
    # 4:00 PM (16:00) IST
    scheduler.add_job(fetch_all_x_accounts, 'cron', hour=16, minute=0)
    # 9:00 PM (21:00) IST
    scheduler.add_job(fetch_all_x_accounts, 'cron', hour=21, minute=0)
    
    scheduler.start()
    print("APScheduler started: X Social cron jobs scheduled at 5 AM, 4 PM, 9 PM IST.")

@app.on_event("startup")
def startup_event():
    start_scheduler()

if __name__ == "__main__":

    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

