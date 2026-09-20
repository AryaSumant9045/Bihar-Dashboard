-- New intelligence-report fields for the War Room AI summary (generate-insight cron)
ALTER TABLE news_insights
ADD COLUMN IF NOT EXISTS overall_political_health_score JSONB,
ADD COLUMN IF NOT EXISTS trend_since_last_cycle JSONB,
ADD COLUMN IF NOT EXISTS top_priority_today JSONB,
ADD COLUMN IF NOT EXISTS most_active_opposition_voices_this_cycle JSONB,
ADD COLUMN IF NOT EXISTS data_quality JSONB,
ADD COLUMN IF NOT EXISTS bjp_advantage_points JSONB;
