import { APIModel, getBaseAPIURL } from './APIModel';
import type { DeckCard } from '../../types/deck';

export interface ResolvedImport {
  resolved: DeckCard[];
  unresolved: string[];
}

export class PtcglService extends APIModel {
  constructor() {
    super({
      baseURL: getBaseAPIURL(),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
    });
  }

  async resolve(text: string): Promise<ResolvedImport> {
    const response = await this.post<{
      resolved: { quantity: number; card: DeckCard['card'] }[];
      unresolved: string[];
    }>('/decks/ptcgl/resolve', { text });
    return {
      resolved: response.data.resolved.map((r) => ({ card: r.card, quantity: r.quantity })),
      unresolved: response.data.unresolved
    };
  }
}
