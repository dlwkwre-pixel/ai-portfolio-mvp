-- Adds provenance to the Decision Journal so AI-generated entries (auto-logged
-- from a recommendation run) are distinguishable from the user's own manual
-- entries, and can be de-duped against the recommendation item they came from.

ALTER TABLE public.decision_journal
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual', -- manual | ai
  ADD COLUMN IF NOT EXISTS recommendation_item_id uuid;            -- links to recommendation_items.id

-- One journal entry per recommendation item (idempotent auto-logging).
CREATE UNIQUE INDEX IF NOT EXISTS decision_journal_rec_item_uniq
  ON public.decision_journal (recommendation_item_id)
  WHERE recommendation_item_id IS NOT NULL;
