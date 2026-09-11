from supabase import create_client
import os

from dotenv import load_dotenv
load_dotenv()

supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not supabase_url or not supabase_key:
    print("Missing env variables")
    exit(1)

client = create_client(supabase_url, supabase_key)
res = client.table("analyzed_items").select("id, summary, raw_items(title)").order("created_at", desc=True).limit(5).execute()

for item in res.data:
    print(f"ID: {item['id']}")
    print(f"TITLE:   {item['raw_items']['title']}")
    print(f"SUMMARY: {item['summary']}")
    print("-" * 40)
