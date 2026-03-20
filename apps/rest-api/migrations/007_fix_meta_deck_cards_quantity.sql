-- Basic energy cards have no copy limit in Pokemon TCG.
-- Relax the quantity check from BETWEEN 1 AND 4 to simply >= 1.
ALTER TABLE meta_deck_cards DROP CONSTRAINT IF EXISTS meta_deck_cards_quantity_check;

DO $$ BEGIN
  ALTER TABLE meta_deck_cards ADD CONSTRAINT meta_deck_cards_quantity_check CHECK (quantity >= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
