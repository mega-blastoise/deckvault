-- Basic energy cards have no copy limit in Pokemon TCG.
-- Relax the quantity check from BETWEEN 1 AND 4 to simply >= 1.
ALTER TABLE meta_deck_cards
  DROP CONSTRAINT meta_deck_cards_quantity_check,
  ADD CONSTRAINT meta_deck_cards_quantity_check CHECK (quantity >= 1);
