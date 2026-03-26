ALTER TABLE meta_decks ADD COLUMN IF NOT EXISTS tier VARCHAR(2);
-- NULL = untiered; valid values: 'S', 'A', 'B', 'C', 'D'
