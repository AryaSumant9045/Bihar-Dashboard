-- ============================================================
-- Bihar Dashboard — Supabase Database Migration
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. RAW_ITEMS — raw fetched news/YouTube/RSS data
CREATE TABLE IF NOT EXISTS raw_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type      TEXT NOT NULL CHECK (source_type IN ('news', 'youtube', 'rss', 'manual')),
  source_name      TEXT NOT NULL,
  title            TEXT NOT NULL,
  content          TEXT,
  url              TEXT,
  published_at     TIMESTAMPTZ,
  raw_fetched_at   TIMESTAMPTZ DEFAULT NOW(),
  gemini_processed BOOLEAN DEFAULT FALSE,
  UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS idx_raw_items_gemini_processed ON raw_items (gemini_processed);
CREATE INDEX IF NOT EXISTS idx_raw_items_raw_fetched_at   ON raw_items (raw_fetched_at DESC);

-- 2. ANALYZED_ITEMS — Gemini AI structured output
CREATE TABLE IF NOT EXISTS analyzed_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_item_id      UUID REFERENCES raw_items (id) ON DELETE CASCADE,
  module           TEXT CHECK (module IN (
                     'Breaking News', 'Opposition Tracker', 'PK Tracker',
                     'Leadership Tracker', 'Media Pulse', 'General'
                   )),
  district         TEXT DEFAULT 'General',
  who              TEXT,
  event_type       TEXT,
  issue            TEXT,
  public_statement TEXT,
  priority         TEXT CHECK (priority IN ('Critical', 'Developing', 'Watch', 'Routine')),
  summary          TEXT,
  status           TEXT DEFAULT 'नया' CHECK (status IN ('नया', 'review हुआ', 'closed')),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analyzed_module   ON analyzed_items (module);
CREATE INDEX IF NOT EXISTS idx_analyzed_priority ON analyzed_items (priority);
CREATE INDEX IF NOT EXISTS idx_analyzed_district ON analyzed_items (district);
CREATE INDEX IF NOT EXISTS idx_analyzed_created  ON analyzed_items (created_at DESC);

-- 3. DISTRICTS — Bihar ke 38 districts master list
CREATE TABLE IF NOT EXISTS districts (
  id   SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

INSERT INTO districts (name) VALUES
  ('Araria'), ('Arwal'), ('Aurangabad'), ('Banka'), ('Begusarai'),
  ('Bhagalpur'), ('Bhojpur'), ('Buxar'), ('Darbhanga'), ('East Champaran'),
  ('Gaya'), ('Gopalganj'), ('Jamui'), ('Jehanabad'), ('Kaimur'),
  ('Katihar'), ('Khagaria'), ('Kishanganj'), ('Lakhisarai'), ('Madhepura'),
  ('Madhubani'), ('Munger'), ('Muzaffarpur'), ('Nalanda'), ('Nawada'),
  ('Patna'), ('Purnia'), ('Rohtas'), ('Saharsa'), ('Samastipur'),
  ('Saran'), ('Sheikhpura'), ('Sheohar'), ('Sitamarhi'), ('Siwan'),
  ('Supaul'), ('Vaishali'), ('West Champaran')
ON CONFLICT (name) DO NOTHING;

-- 4. ENTITIES — Neta/party master list
CREATE TABLE IF NOT EXISTS entities (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT UNIQUE NOT NULL,
  party TEXT,
  role  TEXT
);

INSERT INTO entities (name, party, role) VALUES
  ('Nitish Kumar',    'JDU',        'Chief Minister, Bihar'),
  ('Tejashwi Yadav',  'RJD',        'Leader of Opposition'),
  ('Prashant Kishor', 'Jan Suraaj', 'Founder, Jan Suraaj Party'),
  ('Lalu Prasad Yadav','RJD',       'National President, RJD'),
  ('Chirag Paswan',   'LJPRAM',     'Union Minister / Party President'),
  ('Samrat Choudhary','BJP',        'Bihar BJP President'),
  ('Sushil Kumar Modi','BJP',       'Senior BJP Leader'),
  ('Jitan Ram Manjhi','HAM',        'Union Minister / Party President'),
  ('Upendra Kushwaha','RLJP',       'Party President, RLJP'),
  ('Rahul Gandhi',    'INC',        'Leader of Opposition, Lok Sabha')
ON CONFLICT (name) DO NOTHING;

-- 5. ALERTS — High-priority items for quick homepage access
CREATE TABLE IF NOT EXISTS alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analyzed_item_id UUID REFERENCES analyzed_items (id) ON DELETE CASCADE,
  priority         TEXT NOT NULL CHECK (priority IN ('Critical', 'Developing')),
  title            TEXT NOT NULL,
  summary          TEXT,
  district         TEXT,
  module           TEXT,
  is_read          BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_is_read   ON alerts (is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_priority  ON alerts (priority);
CREATE INDEX IF NOT EXISTS idx_alerts_created   ON alerts (created_at DESC);

-- ============================================================
-- Row Level Security (RLS) — anon key se read/write allowed
-- ============================================================
ALTER TABLE raw_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyzed_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read raw_items"      ON raw_items      FOR SELECT USING (true);
CREATE POLICY "Allow anon read analyzed_items" ON analyzed_items FOR SELECT USING (true);
CREATE POLICY "Allow anon read districts"      ON districts      FOR SELECT USING (true);
CREATE POLICY "Allow anon read entities"       ON entities       FOR SELECT USING (true);
CREATE POLICY "Allow anon read alerts"         ON alerts         FOR SELECT USING (true);

CREATE POLICY "Allow anon insert raw_items"      ON raw_items      FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon insert analyzed_items" ON analyzed_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon insert alerts"         ON alerts         FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update raw_items"      ON raw_items      FOR UPDATE USING (true);
CREATE POLICY "Allow anon update alerts"         ON alerts         FOR UPDATE USING (true);
