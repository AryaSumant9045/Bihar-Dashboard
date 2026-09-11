ALTER TABLE raw_items ADD COLUMN IF NOT EXISTS processing BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE raw_items ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_raw_items_analysis_queue ON raw_items (gemini_processed, processing, raw_fetched_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analyzed_items_raw_item_unique ON analyzed_items(raw_item_id);
CREATE TABLE IF NOT EXISTS processing_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), trigger TEXT NOT NULL DEFAULT 'scheduler', started_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ NOT NULL, claimed INTEGER NOT NULL DEFAULT 0, processed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE processing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon read processing_logs" ON processing_logs FOR SELECT USING (true);
CREATE POLICY "Allow anon insert processing_logs" ON processing_logs FOR INSERT WITH CHECK (true);
CREATE OR REPLACE FUNCTION claim_raw_items(requested_batch_size INTEGER DEFAULT 20)
RETURNS SETOF raw_items LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (SELECT id FROM raw_items WHERE gemini_processed = FALSE AND (processing = FALSE OR processing_started_at < NOW() - INTERVAL '30 minutes') ORDER BY raw_fetched_at ASC LIMIT LEAST(GREATEST(requested_batch_size, 1), 30) FOR UPDATE SKIP LOCKED)
  UPDATE raw_items AS item SET processing = TRUE, processing_started_at = NOW() FROM candidates WHERE item.id = candidates.id RETURNING item.*;
END;
$$;
GRANT EXECUTE ON FUNCTION claim_raw_items(INTEGER) TO anon, authenticated;