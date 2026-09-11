-- Server-side Action Centre state and audit history.
CREATE TABLE IF NOT EXISTS war_room_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source TEXT,
  priority TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'review', 'assigned', 'report', 'monitor', 'closed')),
  assignee TEXT,
  comment TEXT,
  deadline TIMESTAMPTZ,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_war_room_actions_status ON war_room_actions(status);
CREATE INDEX IF NOT EXISTS idx_war_room_actions_deadline ON war_room_actions(deadline);

CREATE TABLE IF NOT EXISTS war_room_action_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES war_room_actions(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  actor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_war_room_action_history_action ON war_room_action_history(action_id, created_at DESC);

ALTER TABLE war_room_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE war_room_action_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read war room actions" ON war_room_actions FOR SELECT USING (true);
CREATE POLICY "Allow anon insert war room actions" ON war_room_actions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update war room actions" ON war_room_actions FOR UPDATE USING (true);
CREATE POLICY "Allow anon read action history" ON war_room_action_history FOR SELECT USING (true);
CREATE POLICY "Allow anon insert action history" ON war_room_action_history FOR INSERT WITH CHECK (true);
