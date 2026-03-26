-- Enable trigram extension for fuzzy archetype matching in scaffold endpoint.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index on meta_decks.archetype to make similarity queries fast.
CREATE INDEX IF NOT EXISTS idx_meta_decks_archetype_trgm
  ON meta_decks USING gin (LOWER(archetype) gin_trgm_ops);
