import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")  # Using ANON KEY
supabase = create_client(url, key)
try:
    res = supabase.table("news_insights").select("*").limit(1).execute()
    print("Success with Anon Key:", res.data)
except Exception as e:
    print("Error with Anon Key:", e)
