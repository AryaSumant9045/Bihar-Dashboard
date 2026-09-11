CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_items_url_unique
  ON raw_items(url)
  WHERE url IS NOT NULL AND url <> '';