-- Leadership Intelligence Engine: issue domain classification per activity
ALTER TABLE leader_activities
ADD COLUMN IF NOT EXISTS issue_domain TEXT DEFAULT 'Other';
