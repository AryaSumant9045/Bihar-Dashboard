from fastapi import FastAPI
from fastapi import HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import feedparser
import os
import sys

# Add current directory to path if running directly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from fetchers import get_all_live_news

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
    news = get_all_live_news()
    return {"status": "success", "data": news}

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

# Mount the static frontend directory (which is the parent directory of backend)
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/", StaticFiles(directory=base_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
