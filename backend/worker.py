"""Low-cost Bihar news ingestion and Gemini analysis worker.

Run with: python3 backend/worker.py
It fetches all configured feeds, deduplicates into raw_items, then analyzes
only rows where gemini_processed is false.
"""

import time
from datetime import datetime, timezone

from fetchers import get_all_live_news
from gemini_analyzer import run_analysis

INTERVAL_SECONDS = 15 * 60
ANALYSIS_BATCH_SIZE = 20


def run_cycle():
    print(f"\n[{datetime.now(timezone.utc).isoformat()}] Fetching Bihar news feeds...")
    fetched = get_all_live_news(save_to_db=True)
    print(f"Fetched {len(fetched)} feed items; duplicate URLs were skipped by Supabase.")
    result = run_analysis(limit=ANALYSIS_BATCH_SIZE)
    print(f"Analysis cycle complete: {result}")


if __name__ == "__main__":
    print(f"Bihar pipeline worker started. Interval: {INTERVAL_SECONDS // 60} minutes.")
    while True:
        try:
            run_cycle()
        except Exception as error:
            print(f"Pipeline cycle failed: {error}")
        print(f"Sleeping for {INTERVAL_SECONDS // 60} minutes...")
        time.sleep(INTERVAL_SECONDS)
