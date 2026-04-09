export interface ResolvedDeck {
  readonly name: string;
  readonly cards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
  readonly source: 'saved' | 'paste' | 'meta';
  readonly totalCards: number;
}

export type DeckInputMode = 'saved' | 'paste' | 'meta';

export interface DeckInputPanelProps {
  readonly label: string;
  readonly onDeckResolved: (deck: ResolvedDeck) => void;
  readonly onDeckCleared: () => void;
  readonly resolvedDeck: ResolvedDeck | null;
  readonly showMetaOnly?: boolean;
}

export interface MetaDeck {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tier: string;
  readonly format: string;
  readonly cards: ReadonlyArray<{ cardId: string; quantity: number }>;
  readonly coverCardId: string;
  readonly eventName: string;
  readonly eventDate: string;
  readonly sourceUrl: string;
}

export interface SavedDeckItem {
  readonly id: string;
  readonly name: string;
  readonly format: string;
  readonly cards: ReadonlyArray<{ card: { id: string; images?: { small?: string } }; quantity: number }>;
  readonly coverCardId?: string;
}
