CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id   UUID    NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id   TEXT    NOT NULL,
  quantity  SMALLINT NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 4),
  PRIMARY KEY (deck_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON deck_cards(deck_id);
