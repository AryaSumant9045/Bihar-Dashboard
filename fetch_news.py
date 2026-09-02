"""Fetch Bihar political news from NewsData.io and save it in Supabase.

Run this long-lived worker separately from the static dashboard:
  python -m pip install -r requirements.txt
  python fetch_news.py
"""

import os
import time
from pathlib import Path

import requests
from supabase import create_client


def load_env(path=".env"):
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")
NEWS_API_KEY = os.getenv("NEWS_DATA_API_KEY")
POLL_SECONDS = int(os.getenv("NEWS_POLL_SECONDS", "3600"))
MAX_ARTICLES = int(os.getenv("NEWS_MAX_ARTICLES_PER_RUN", "10"))
MAX_PAGES = int(os.getenv("NEWS_MAX_PAGES", "10"))

BIHAR_DISTRICTS = [
    "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar",
    "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar",
    "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda",
    "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar",
    "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"
]
POLITICAL_KEYWORDS = [
    "bjp", "rjd", "jdu", "lojp", "ham", "vip party", "janata dal", "nda", "mahagathbandhan", "indi alliance",
    "election", "chunav", "vidhan sabha", "assembly election", "lok sabha", "voter", "campaign", "manifesto", "nomination", "polling booth",
    "nitish kumar", "tejashwi yadav", "prashant kishor", "lalu yadav", "chirag paswan", "sushil modi", "samrat choudhary", "jitan ram manjhi", "pawan singh",
    "cabinet minister", "opposition", "political rally", "dharna", "political yatra", "press conference", "cm nitish", "bihar cm", "bihar bjp", "bihar rjd"
]


def validate_config():
    missing = [name for name, value in {"SUPABASE_URL": SUPABASE_URL, "SUPABASE_ANON_KEY": SUPABASE_KEY, "NEWS_DATA_API_KEY": NEWS_API_KEY}.items() if not value]
    if missing:
        raise RuntimeError("Missing " + ", ".join(missing) + ". Copy .env.example to .env and fill the values.")


def politically_relevant(text):
    lower = text.lower()
    return "bihar" in lower and any(keyword in lower for keyword in POLITICAL_KEYWORDS)


def district_tags(text):
    lower = text.lower()
    return [district for district in BIHAR_DISTRICTS if district.lower() in lower]


def already_saved(client, title):
    result = client.table("NewsDashboard").select("id").eq("title", title).limit(1).execute()
    return bool(result.data)


def fetch_and_save(client):
    saved = 0
    next_page = None
    for _ in range(MAX_PAGES):
        params = {"apikey": NEWS_API_KEY, "q": "Bihar", "language": "hi,en", "country": "in"}
        if next_page:
            params["page"] = next_page
        response = requests.get("https://newsdata.io/api/1/news", params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
        if payload.get("status") != "success":
            raise RuntimeError(payload.get("message") or "NewsData API did not return success")

        for article in payload.get("results", []):
            title = (article.get("title") or "").strip()
            content = (article.get("description") or article.get("content") or "").strip()
            combined = f"{title} {content}"
            if not title or not politically_relevant(combined) or already_saved(client, title):
                continue
            tags = district_tags(combined)
            client.table("NewsDashboard").insert({"title": title, "content": content, "author": ", ".join(tags) if tags else "General"}).execute()
            saved += 1
            print(f"Saved: {title[:65]} [District: {', '.join(tags) or 'General'}]")
            if saved >= MAX_ARTICLES:
                break
        if saved >= MAX_ARTICLES:
            break
        next_page = payload.get("nextPage")
        if not next_page:
            break
    print(f"Saved {saved} new political Bihar articles.")


def main():
    validate_config()
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    while True:
        try:
            fetch_and_save(client)
        except (requests.RequestException, RuntimeError) as error:
            print(f"Fetch failed: {error}")
        print(f"Waiting {POLL_SECONDS} seconds…")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
