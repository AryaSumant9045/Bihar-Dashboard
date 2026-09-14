-- ============================================================
-- 008_news_summary_pipeline.sql
-- Rolling batched summary pipeline tables + cleanup function
-- Run this in Supabase SQL Editor before deploying
-- ============================================================

-- 1. Track each cron run session
CREATE TABLE IF NOT EXISTS cron_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type     TEXT NOT NULL DEFAULT 'news_fetch'
                   CHECK (session_type IN ('news_fetch', 'cleanup')),
  schedule_slot    TEXT NOT NULL DEFAULT 'morning'
                   CHECK (schedule_slot IN ('morning', 'noon', 'evening', 'manual')),
  status           TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'fetching', 'processing', 'completed', 'failed')),
  total_fetched    INTEGER DEFAULT 0,
  total_new        INTEGER DEFAULT 0,
  total_processed  INTEGER DEFAULT 0,
  total_batches    INTEGER DEFAULT 0,
  error_message    TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_sessions_status  ON cron_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cron_sessions_created ON cron_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_sessions_slot    ON cron_sessions(schedule_slot, created_at DESC);

-- 2. Link raw_items to their cron session (new columns)
ALTER TABLE raw_items
  ADD COLUMN IF NOT EXISTS cron_session_id UUID REFERENCES cron_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS batch_number    INTEGER;

CREATE INDEX IF NOT EXISTS idx_raw_items_cron_session ON raw_items(cron_session_id);
CREATE INDEX IF NOT EXISTS idx_raw_items_batch        ON raw_items(batch_number);

-- 3. Rolling summaries — the core of the new system
CREATE TABLE IF NOT EXISTS news_summaries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_session_id     UUID REFERENCES cron_sessions(id) ON DELETE CASCADE,
  batch_number        INTEGER NOT NULL,
  batch_size          INTEGER NOT NULL DEFAULT 50,

  -- The news headlines included in this batch (array of titles)
  news_headlines      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Raw LLM output
  summary_content     TEXT NOT NULL,

  -- Structured inference extracted by LLM
  inference           JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected keys:
  -- district_situation: { district_name: "summary", ... }
  -- problem_areas: ["area1", ...]
  -- party_activities: { "BJP": "...", "RJD": "...", ... }
  -- critical_issues: ["issue1", ...]
  -- political_temperature: "high|medium|low"
  -- overall_situation: "2-3 line summary in Hindi"

  -- LLM provider used
  llm_provider        TEXT NOT NULL DEFAULT 'gemini'
                      CHECK (llm_provider IN ('gemini', 'groq', 'plugsky')),
  llm_model           TEXT,

  -- Token tracking
  input_tokens        INTEGER,
  output_tokens       INTEGER,

  -- Is this the final consolidated summary of the session?
  is_final            BOOLEAN NOT NULL DEFAULT FALSE,

  -- Chain: what was the previous summary used as context?
  previous_summary_id UUID REFERENCES news_summaries(id) ON DELETE SET NULL,

  processing_time_ms  INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_summaries_session ON news_summaries(cron_session_id);
CREATE INDEX IF NOT EXISTS idx_news_summaries_final   ON news_summaries(is_final, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_summaries_created ON news_summaries(created_at DESC);

-- 4. RLS policies
ALTER TABLE cron_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_summaries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cron_sessions' AND policyname = 'Allow anon read cron_sessions'
  ) THEN
    CREATE POLICY "Allow anon read cron_sessions"   ON cron_sessions FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cron_sessions' AND policyname = 'Allow anon insert cron_sessions'
  ) THEN
    CREATE POLICY "Allow anon insert cron_sessions" ON cron_sessions FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cron_sessions' AND policyname = 'Allow anon update cron_sessions'
  ) THEN
    CREATE POLICY "Allow anon update cron_sessions" ON cron_sessions FOR UPDATE USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'news_summaries' AND policyname = 'Allow anon read news_summaries'
  ) THEN
    CREATE POLICY "Allow anon read news_summaries"   ON news_summaries FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'news_summaries' AND policyname = 'Allow anon insert news_summaries'
  ) THEN
    CREATE POLICY "Allow anon insert news_summaries" ON news_summaries FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'news_summaries' AND policyname = 'Allow anon update news_summaries'
  ) THEN
    CREATE POLICY "Allow anon update news_summaries" ON news_summaries FOR UPDATE USING (true);
  END IF;
END $$;

-- 5. Weekly cleanup function — deletes data older than N days
CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 7)
RETURNS JSONB AS $$
DECLARE
  cutoff              TIMESTAMPTZ := NOW() - (days_to_keep || ' days')::INTERVAL;
  deleted_summaries   INTEGER := 0;
  deleted_raw         INTEGER := 0;
  deleted_analyzed    INTEGER := 0;
  deleted_sessions    INTEGER := 0;
  deleted_alerts      INTEGER := 0;
  deleted_errors      INTEGER := 0;
BEGIN
  -- Delete old analysis_errors first (FK deps on raw_items + analyzed_items)
  DELETE FROM analysis_errors WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_errors = ROW_COUNT;

  -- Delete old alerts (FK dep on analyzed_items)
  DELETE FROM alerts WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_alerts = ROW_COUNT;

  -- Delete old analyzed_items (FK dep on raw_items)
  DELETE FROM analyzed_items WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_analyzed = ROW_COUNT;

  -- Delete old raw_items
  DELETE FROM raw_items WHERE raw_fetched_at < cutoff;
  GET DIAGNOSTICS deleted_raw = ROW_COUNT;

  -- Delete old news_summaries (FK dep on cron_sessions)
  DELETE FROM news_summaries WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_summaries = ROW_COUNT;

  -- Delete old cron_sessions
  DELETE FROM cron_sessions WHERE created_at < cutoff;
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff',              cutoff,
    'deleted_raw_items',   deleted_raw,
    'deleted_analyzed',    deleted_analyzed,
    'deleted_summaries',   deleted_summaries,
    'deleted_sessions',    deleted_sessions,
    'deleted_alerts',      deleted_alerts,
    'deleted_errors',      deleted_errors
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant RPC access
GRANT EXECUTE ON FUNCTION cleanup_old_data(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION cleanup_old_data(INTEGER) TO authenticated;
