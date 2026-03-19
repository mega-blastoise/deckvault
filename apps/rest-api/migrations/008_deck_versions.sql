CREATE TABLE IF NOT EXISTS deck_versions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id    UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  label      VARCHAR(80),
  cards      JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (deck_id, version)
);

CREATE INDEX IF NOT EXISTS idx_deck_versions_deck ON deck_versions(deck_id);
