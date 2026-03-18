CREATE TABLE IF NOT EXISTS decks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  format        TEXT NOT NULL DEFAULT 'standard',
  cover_card_id TEXT,
  is_public     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_is_public ON decks(is_public);
CREATE INDEX IF NOT EXISTS idx_decks_updated_at ON decks(updated_at DESC);
