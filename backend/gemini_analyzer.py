"""
gemini_analyzer.py — Bihar Dashboard AI Analysis Engine
--------------------------------------------------------
Unprocessed raw_items ko Gemini se analyze karta hai aur
structured output analyzed_items + alerts tables mein save karta hai.
"""

import os
import json
import time
import re
import google.generativeai as genai
from supabase import create_client
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))

GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY")
SUPABASE_URL     = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY     = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

BIHAR_DISTRICTS = [
    "Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar",
    "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur",
    "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger",
    "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur",
    "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran"
]

GEMINI_SYSTEM_PROMPT = """आप BJP Bihar War Room के लिए एक Political Intelligence Analyst AI हैं। News API, Google News और YouTube channels के raw content को structured, decision-useful format में बदलें। Opposition (RJD, Congress/INC Bihar, Jan Suraaj, Prashant Kishor) की सार्वजनिक राजनीतिक गतिविधियों पर फोकस करें।

सिर्फ public political activity/statements पर आधारित रहें; निजी जानकारी, अनुमान, भविष्यवाणी या रणनीति सुझाव न दें। Facts और opinion अलग रखें। Source में जानकारी न हो तो "Unclear from source" लिखें। Neutral और factual tone रखें। केवल Bihar या Bihar politics से directly related content को relevant मानें।

केवल valid JSON लौटाएं, बिना markdown या extra text। JSON fields:
module: Breaking News / Opposition Tracker / Prashant Kishor Tracker / Leadership Tracker / Media & Social Pulse / Issues & Grievances
district: matched Bihar district या General
who: involved leader/party/organisation
event_type: Rally / Press Conference / Public Statement / Interview / Social Media Post / Protest/Dharna / Yatra / Meeting / Other
issue: source में स्पष्ट issue या Unclear from source
public_statement: direct statement का neutral सार या Unclear from source
public_reach_indicator: engagement/crowd/viewership या Not mentioned
factual_context_needed: true या false
priority: Critical / Developing / Watch / Routine
priority_reason: एक factual line
summary: Hindi में 2-3 line का neutral factual सारांश
source_reliability: Verified News Source / YouTube Official Channel / Needs Verification

Priority: Critical = तेजी से बढ़ता/बड़ा संवेदनशील मुद्दा; Developing = momentum; Watch = शुरुआती signal; Routine = सामान्य गतिविधि।"""

MODULE_MAP = {
    "Breaking News": "Breaking News",
    "Opposition Tracker": "Opposition Tracker",
    "Prashant Kishor Tracker": "PK Tracker",
    "Leadership Tracker": "Leadership Tracker",
    "Media & Social Pulse": "Media Pulse",
    "Issues & Grievances": "General",
}


def get_clients():
    """Initialize Supabase and Gemini clients."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Supabase credentials not found in .env")
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY not found in .env")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash-lite", system_instruction=GEMINI_SYSTEM_PROMPT)
    return supabase, model


def build_prompt(title: str, content: str) -> str:
        return f"Article Title: {title}\nArticle Content: {content or 'N/A'}"


def extract_json(text: str) -> dict:
    """Extract JSON from Gemini response, handling markdown code blocks."""
    # Remove markdown code fences if present
    text = re.sub(r"```(?:json)?\s*", "", text).strip()
    text = text.rstrip("`").strip()
    return json.loads(text)


def analyze_item(model, raw_item: dict, max_retries: int = 3) -> dict | None:
    """Send one raw_item to Gemini and return structured analysis.
    Retries on 429 rate-limit errors with the suggested wait time.
    """
    title   = raw_item.get("title", "")
    content = raw_item.get("content", "")
    prompt  = build_prompt(title, content)

    for attempt in range(1, max_retries + 1):
        try:
            response = model.generate_content(prompt)
            analysis = extract_json(response.text)

            # Validate required fields
            required = ["module", "district", "who", "event_type", "issue", "public_statement", "public_reach_indicator", "factual_context_needed", "priority", "priority_reason", "summary", "source_reliability"]
            for field in required:
                if field not in analysis:
                    analysis[field] = "General" if field in ("module", "district") else (False if field == "factual_context_needed" else "Unclear from source")

            # Normalize priority
            valid_priorities = {"Critical", "Developing", "Watch", "Routine"}
            if analysis.get("priority") not in valid_priorities:
                analysis["priority"] = "Watch"

            # Normalize module
            valid_modules = {"Breaking News", "Opposition Tracker", "PK Tracker", "Leadership Tracker", "Media Pulse", "General"}
            analysis["module"] = MODULE_MAP.get(analysis.get("module"), analysis.get("module", "General"))
            if analysis.get("module") not in valid_modules:
                analysis["module"] = "General"

            return analysis

        except Exception as e:
            err_str = str(e)
            # Check if it's a rate-limit (429) error
            if "429" in err_str or "quota" in err_str.lower() or "rate" in err_str.lower():
                # Try to extract retry_delay from error message
                wait = 60  # default wait
                import re as _re
                match = _re.search(r"retry in (\d+)", err_str)
                if match:
                    wait = int(match.group(1)) + 5
                if attempt < max_retries:
                    print(f"  ⏳ Rate limit hit (attempt {attempt}/{max_retries}). Waiting {wait}s before retry...")
                    time.sleep(wait)
                    continue
                else:
                    print(f"  ❌ Rate limit — max retries reached for '{title[:50]}'")
                    return None
            else:
                print(f"  ⚠️  Gemini parse error for '{title[:50]}...': {e}")
                return None


def save_analyzed_item(supabase, raw_item_id: str, analysis: dict) -> str | None:
    """Insert into analyzed_items table and return new row ID."""
    try:
        result = supabase.table("analyzed_items").insert({
            "raw_item_id":      raw_item_id,
            "module":           analysis.get("module", "General"),
            "district":         analysis.get("district", "General"),
            "who":              analysis.get("who"),
            "event_type":       analysis.get("event_type"),
            "issue":            analysis.get("issue"),
            "public_statement": analysis.get("public_statement") or analysis.get("summary"),
            "public_reach_indicator": analysis.get("public_reach_indicator", "Not mentioned"),
            "factual_context_needed": analysis.get("factual_context_needed") is True or analysis.get("factual_context_needed") == "true",
            "priority":         analysis.get("priority", "Watch"),
            "priority_reason":  analysis.get("priority_reason", "Unclear from source"),
            "source_reliability": analysis.get("source_reliability", "Needs Verification"),
            "summary":          analysis.get("summary"),
            "status":           "नया",
        }).execute()
        return result.data[0]["id"] if result.data else None
    except Exception as e:
        print(f"  ❌ Error saving analyzed_item: {e}")
        return None


def save_alert(supabase, analyzed_item_id: str, raw_item: dict, analysis: dict):
    """If priority is Critical or Developing, save to alerts table."""
    if analysis.get("priority") not in ("Critical", "Developing"):
        return
    try:
        supabase.table("alerts").insert({
            "analyzed_item_id": analyzed_item_id,
            "priority":         analysis["priority"],
            "title":            raw_item.get("title", "")[:300],
            "summary":          analysis.get("summary", ""),
            "district":         analysis.get("district", "General"),
            "module":           analysis.get("module", "General"),
            "is_read":          False,
        }).execute()
        print(f"  🔔 Alert saved — {analysis['priority']}: {raw_item.get('title', '')[:60]}")
    except Exception as e:
        print(f"  ❌ Error saving alert: {e}")


def mark_processed(supabase, raw_item_id: str):
    """Mark raw_item as gemini_processed = true."""
    try:
        supabase.table("raw_items").update({"gemini_processed": True}).eq("id", raw_item_id).execute()
    except Exception as e:
        print(f"  ❌ Error marking processed: {e}")


def run_analysis(limit: int = 20, delay_seconds: float = 1.5) -> dict:
    """
    Main entry point: fetch unprocessed raw_items, analyze with Gemini,
    save results to analyzed_items + alerts.

    Args:
        limit:         max items to process in one run (to respect rate limits)
        delay_seconds: wait between Gemini calls (avoid rate limiting)

    Returns:
        Summary dict with counts.
    """
    print("🚀 Starting Gemini analysis pipeline...")
    supabase, model = get_clients()

    # Fetch unprocessed items
    result = (
        supabase.table("raw_items")
        .select("id, title, content, source_name, source_type")
        .eq("gemini_processed", False)
        .order("raw_fetched_at", desc=False)
        .limit(limit)
        .execute()
    )
    unprocessed = result.data or []

    if not unprocessed:
        print("✅ No unprocessed items found. All caught up!")
        return {"processed": 0, "errors": 0, "alerts_created": 0}

    print(f"📋 Found {len(unprocessed)} unprocessed items. Starting analysis...\n")

    processed_count = 0
    error_count     = 0
    alerts_count    = 0

    for i, raw_item in enumerate(unprocessed, 1):
        title = raw_item.get("title", "Untitled")[:80]
        print(f"[{i}/{len(unprocessed)}] Analyzing: {title}...")

        analysis = analyze_item(model, raw_item)

        if analysis is None:
            error_count += 1
            # Keep failed items unprocessed so the next worker cycle can retry them.
            continue

        print(f"  ✅ Module: {analysis['module']} | Priority: {analysis['priority']} | District: {analysis['district']}")

        analyzed_id = save_analyzed_item(supabase, raw_item["id"], analysis)

        if analyzed_id:
            processed_count += 1
            if analysis.get("priority") in ("Critical", "Developing"):
                save_alert(supabase, analyzed_id, raw_item, analysis)
                alerts_count += 1
            mark_processed(supabase, raw_item["id"])
        else:
            error_count += 1

        # Rate limiting — don't hammer Gemini API
        if i < len(unprocessed):
            time.sleep(delay_seconds)

    summary = {
        "processed":       processed_count,
        "errors":          error_count,
        "alerts_created":  alerts_count,
        "total_attempted": len(unprocessed),
    }
    print(f"\n📊 Analysis complete: {processed_count} processed, {error_count} errors, {alerts_count} alerts created")
    return summary


if __name__ == "__main__":
    run_analysis(limit=20)
