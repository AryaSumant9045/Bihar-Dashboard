# Live district-wise news setup

1. Copy `.env.example` to `.env` and add the Supabase and NewsData values.
2. Start the ingestion worker:

   ```bash
   python -m pip install -r requirements.txt
   python fetch_news.py
   ```

3. In Supabase SQL Editor, enable Realtime once:

   ```sql
   alter publication supabase_realtime add table "NewsDashboard";
   ```

4. Serve this static dashboard and open **War Room**. New rows appear instantly. The district dropdown runs `author ILIKE '%District%'` and shows only matching records.

`NEWS_POLL_SECONDS=60` can be used temporarily for a one-minute development interval. Do not place `NEWS_DATA_API_KEY` in browser JavaScript.
