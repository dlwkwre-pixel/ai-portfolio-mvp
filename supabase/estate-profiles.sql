-- Estate & Will planning tracker for the Planning area
-- Organizational tool only — not legal advice. Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS estate_profiles (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                   UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Document checklist statuses: 'none' | 'draft' | 'signed' | 'notarized' | 'filed'
  doc_will                  TEXT        DEFAULT 'none',
  doc_living_trust          TEXT        DEFAULT 'none',
  doc_durable_poa           TEXT        DEFAULT 'none',
  doc_healthcare_directive  TEXT        DEFAULT 'none',
  doc_beneficiary_desig     TEXT        DEFAULT 'none',
  doc_digital_assets        TEXT        DEFAULT 'none',

  -- Key contacts
  executor_name             TEXT,
  executor_phone            TEXT,
  executor_email            TEXT,
  attorney_name             TEXT,
  attorney_phone            TEXT,
  attorney_email            TEXT,
  healthcare_proxy_name     TEXT,
  healthcare_proxy_phone    TEXT,

  -- Beneficiaries: [{ id, name, relationship, allocation_pct, notes }]
  beneficiaries             JSONB       DEFAULT '[]',

  -- Meta
  notes                     TEXT,
  last_reviewed_at          DATE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE estate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own estate profile"
  ON estate_profiles FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
