import type { Deck } from '../../types/deck';
import { APIModel, getBaseAPIURL } from './APIModel';

type CreateDeckInput = Omit<Deck, 'id' | 'createdAt' | 'updatedAt'>;
type UpdateDeckInput = Partial<Omit<Deck, 'id' | 'createdAt'>> & { versionLabel?: string };

export class DecksService extends APIModel {
  constructor() {
    super({
      baseURL: getBaseAPIURL(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });
  }

  listDecks() {
    return this.get<{ data: Deck[] }>('/decks');
  }

  getDeck(id: string) {
    return this.get<{ data: Deck }>(`/decks/${id}`);
  }

  createDeck(input: CreateDeckInput) {
    return this.post<{ data: Deck }>('/decks', input);
  }

  updateDeck(id: string, input: UpdateDeckInput) {
    return this.put<{ data: Deck }>(`/decks/${id}`, input);
  }

  removeDeck(id: string) {
    return this.delete<void>(`/decks/${id}`);
  }
}
