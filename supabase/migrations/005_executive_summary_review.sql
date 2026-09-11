ALTER TABLE analyzed_items
  ADD COLUMN IF NOT EXISTS summary_needs_review BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE analyzed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon update analyzed_items" ON analyzed_items FOR UPDATE USING (true) WITH CHECK (true);