-- Run this in your Supabase SQL editor to add admin-gated account approval.
-- After running, every account that already has a profile row is grandfathered
-- in as approved; any NEW signup after this point starts unapproved and is
-- blocked from the app until approved via /admin/approvals.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS approved     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_by  UUID        REFERENCES auth.users(id);

COMMENT ON COLUMN user_profiles.approved IS 'Admin-gated access. false = pending approval, cannot use the app.';
COMMENT ON COLUMN user_profiles.approved_at IS 'When an admin approved this account. NULL means pending.';
COMMENT ON COLUMN user_profiles.approved_by IS 'Which admin approved this account.';

-- Grandfather every account that already has a profile row as of this migration.
UPDATE user_profiles SET approved = true, approved_at = now() WHERE approved = false;
