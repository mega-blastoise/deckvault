export interface DeckCardEntry {
  readonly id: string;
  readonly quantity: number;
}

export interface CardAttack {
  readonly name: string;
  readonly cost: readonly string[];
  readonly convertedEnergyCost: number;
  readonly damage: string;
  readonly text: string | null;
}

export interface CardAbility {
  readonly name: string;
  readonly text: string | null;
  readonly type: string;
}

export interface CardImages {
  readonly small: string | null;
  readonly large: string | null;
}

export interface CardDetail {
  readonly id: string;
  readonly name: string;
  readonly supertype: string;
  readonly subtypes: readonly string[];
  readonly hp: number | null;
  readonly types: readonly string[];
  readonly attacks: readonly CardAttack[];
  readonly abilities: readonly CardAbility[];
  readonly regulationMark: string | null;
  readonly setId: string;
  readonly number: string;
  readonly rarity: string | null;
  readonly images: CardImages | null;
}

export interface EnrichedDeckCard {
  readonly id: string;
  readonly quantity: number;
  readonly card: CardDetail | null;
}

export interface EnrichedDeck {
  readonly name: string;
  readonly format: string;
  readonly regulationMarks: readonly string[];
  readonly totalCards: number;
  readonly cards: readonly EnrichedDeckCard[];
  readonly meta: Record<string, string> | null;
}
