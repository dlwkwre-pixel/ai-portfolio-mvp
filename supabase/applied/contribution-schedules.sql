-- DCA / contribution scheduler: recurring reminders to invest a set amount.
-- The cron at /api/cron/contribution-reminders fires an in-app notification
-- (app_notifications) on the due date and advances next_due.

CREATE TABLE IF NOT EXISTS contribution_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES portfolios(id) ON DELETE SET NULL,
  label text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  cadence text NOT NULL CHECK (cadence IN ('weekly', 'biweekly', 'monthly')),
  -- monthly: day-of-month 1-28; weekly/biweekly: day-of-week 0-6 (0 = Sunday)
  anchor_day int NOT NULL DEFAULT 1,
  next_due date NOT NULL,
  last_notified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contribution_schedules_user ON contribution_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_contribution_schedules_due ON contribution_schedules(next_due) WHERE active = true;

ALTER TABLE contribution_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own contribution schedules"
  ON contribution_schedules FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
