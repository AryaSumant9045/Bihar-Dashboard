import os
from dotenv import load_dotenv
from supabase import create_client
from datetime import datetime, timedelta, UTC

load_dotenv()
url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
supabase = create_client(url, key)

eight_hours_ago = (datetime.now(UTC) - timedelta(hours=8)).isoformat()
res = supabase.table("bihar_news").select("id").gte("created_at", eight_hours_ago).execute()
print(f"Total news in last 8 hours: {len(res.data)}")
