CREATE TABLE IF NOT EXISTS analysis_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_item_id UUID REFERENCES raw_items(id) ON DELETE SET NULL,
  analyzed_item_id UUID REFERENCES analyzed_items(id) ON DELETE SET NULL,
  error_type TEXT NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_errors_created ON analysis_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_errors_type ON analysis_errors(error_type);
ALTER TABLE analysis_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon insert analysis_errors" ON analysis_errors FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon read analysis_errors" ON analysis_errors FOR SELECT USING (true);