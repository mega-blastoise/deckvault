ALTER TABLE deck_cards DROP CONSTRAINT IF EXISTS deck_cards_quantity_check;

DO $$ BEGIN
  ALTER TABLE deck_cards ADD CONSTRAINT deck_cards_quantity_check CHECK (quantity > 0 AND quantity <= 60);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
