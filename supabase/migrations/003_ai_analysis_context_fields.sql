-- Additional structured fields produced by the Bihar War Room Gemini prompt.
ALTER TABLE analyzed_items
  ADD COLUMN IF NOT EXISTS public_reach_indicator TEXT,
  ADD COLUMN IF NOT EXISTS factual_context_needed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS priority_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_reliability TEXT;

CREATE INDEX IF NOT EXISTS idx_analyzed_context_needed
  ON analyzed_items(factual_context_needed);
CREATE INDEX IF NOT EXISTS idx_analyzed_source_reliability
  ON analyzed_items(source_reliability);
