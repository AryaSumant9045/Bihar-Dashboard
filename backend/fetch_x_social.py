import os
import re
import time
import requests
import feedparser
import concurrent.futures
from datetime import datetime, timezone
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

def get_supabase():
    if SUPABASE_URL and SUPABASE_KEY:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    return None

X_ACCOUNTS = [
    {"handle": "jansuraajonline", "table": "xjansuraaj"},
    {"handle": "INCBihar", "table": "xinc"},
    {"handle": "RahulGandhi", "table": "xrahulgandi"},
    {"handle": "RJDforIndia", "table": "xrjd"},
    {"handle": "yadavtejashwi", "table": "xtejwaniyd"}
]

RSSHUB_BASE_URL = "https://rsshub-9o9d.onrender.com/twitter/user/"

def extract_image_url(entry):
    media = entry.get("media_content") or entry.get("media_thumbnail")
    if media and media[0].get("url"):
        return media[0]["url"]

    html = entry.get("summary") or entry.get("description") or ""
    if not html:
        content = entry.get("content") or []
        if content:
            html = content[0].get("value", "")

    img = re.search(r'<img[^>]+src="([^"]+)"', html)
    if img:
        return img.group(1)
    poster = re.search(r'poster="([^"]+)"', html)
    if poster:
        return poster.group(1)
    return None

def fetch_one_account(account):
    handle = account["handle"]
    table = account["table"]
    url = f"{RSSHUB_BASE_URL}{handle}"
    
    max_retries = 2
    timeout = 60
    
    for attempt in range(max_retries + 1):
        try:
            print(f"[X-Social] Fetching {handle} (Attempt {attempt + 1})...")
            response = requests.get(url, timeout=timeout)
            response.raise_for_status()
            
            feed = feedparser.parse(response.content)
            entries = feed.entries
            
            if not entries:
                print(f"[X-Social] Warning: No entries found for {handle}.")
                return {"handle": handle, "success": True, "count": 0}
                
            supabase = get_supabase()
            if not supabase:
                print("[X-Social] Error: Supabase client not initialized.")
                return {"handle": handle, "success": False, "error": "Supabase client not initialized"}
                
            rows = []
            for entry in entries:
                heading = entry.get("title", "")
                link = entry.get("link", "")
                pub_date = entry.get("published", entry.get("updated", ""))
                
                if not heading:
                    continue
                    
                rows.append({
                    "handle": handle,
                    "heading": heading,
                    "url": link,
                    "published_at": pub_date,
                    "image_url": extract_image_url(entry)
                })
                
            if rows:
                try:
                    result = supabase.table(table).upsert(
                        rows,
                        on_conflict="handle, heading"
                    ).execute()
                except Exception as e:
                    if "image_url" not in str(e):
                        raise
                    print(f"[X-Social] Warning: image_url column missing on {table}, upserting without it.")
                    for row in rows:
                        row.pop("image_url", None)
                    result = supabase.table(table).upsert(
                        rows,
                        on_conflict="handle, heading"
                    ).execute()
                
                inserted = len(result.data) if result.data else 0
                print(f"[X-Social] Success: {handle} -> {inserted} new posts saved to {table}.")
                return {"handle": handle, "success": True, "count": inserted}
            return {"handle": handle, "success": True, "count": 0}
            
        except requests.exceptions.RequestException as e:
            print(f"[X-Social] Error fetching {handle}: {e}")
            if attempt < max_retries:
                print(f"[X-Social] Retrying {handle} in 15 seconds...")
                time.sleep(15)
            else:
                print(f"[X-Social] Failed to fetch {handle} after {max_retries + 1} attempts.")
                return {"handle": handle, "success": False, "error": str(e)}
        except Exception as e:
            print(f"[X-Social] Unexpected error for {handle}: {e}")
            return {"handle": handle, "success": False, "error": str(e)}

def fetch_all_x_accounts():
    print(f"[{datetime.now(timezone.utc).isoformat()}] Starting parallel fetch for X accounts...")
    results = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(X_ACCOUNTS)) as executor:
        future_to_account = {executor.submit(fetch_one_account, acc): acc for acc in X_ACCOUNTS}
        for future in concurrent.futures.as_completed(future_to_account):
            acc = future_to_account[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as exc:
                print(f"[X-Social] Account {acc['handle']} generated an exception: {exc}")
                results.append({"handle": acc["handle"], "success": False, "error": str(exc)})
                
    total_new = sum(r.get("count", 0) for r in results if r.get("success"))
    print(f"[{datetime.now(timezone.utc).isoformat()}] Completed X fetch. Total new posts: {total_new}")
    return results

if __name__ == "__main__":
    fetch_all_x_accounts()
