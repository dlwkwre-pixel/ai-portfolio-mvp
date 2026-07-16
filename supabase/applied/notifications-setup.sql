-- App-wide notifications pushed by admins
-- target_user_id = NULL means broadcast to all users
CREATE TABLE IF NOT EXISTS app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  target_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Per-user read receipts
CREATE TABLE IF NOT EXISTS user_notification_reads (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES app_notifications(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);

ALTER TABLE app_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_notification_reads ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read broadcast + their own notifications
CREATE POLICY "read own and broadcast notifications"
  ON app_notifications FOR SELECT
  USING (target_user_id IS NULL OR target_user_id = auth.uid());

-- Users manage their own read receipts
CREATE POLICY "manage own reads"
  ON user_notification_reads FOR ALL
  USING (user_id = auth.uid());

-- Seed initial launch notification
INSERT INTO app_notifications (title, body) VALUES (
  'What''s new in BuyTune',
  'We''ve shipped the Financial Planning hub, Life Events tracker, Portfolio Performance reset, secondary AI re-analysis, and improved Investment Return (TWR) accuracy. More updates coming soon.'
) ON CONFLICT DO NOTHING;
