CREATE TABLE IF NOT EXISTS news_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE news_insights 
ADD COLUMN IF NOT EXISTS overall_situation TEXT,
ADD COLUMN IF NOT EXISTS bjp_action_points JSONB,
ADD COLUMN IF NOT EXISTS political_risks JSONB,
ADD COLUMN IF NOT EXISTS opposition_activity JSONB,
ADD COLUMN IF NOT EXISTS counter_strategy_points JSONB,
ADD COLUMN IF NOT EXISTS election_watch_items JSONB,
ADD COLUMN IF NOT EXISTS rows_count JSON,
ADD COLUMN IF NOT EXISTS news_count INTEGER;
