import { type Pokemon } from '@pokemon/clients';
import { APIModel, getBaseAPIURL } from './APIModel';
import type { CardFunctionalTag } from '../../types/card-tags';

export class CardsService extends APIModel implements APIModel {
  constructor() {
    const baseURL = getBaseAPIURL();
    super({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, br'
      }
    });
  }

  getCards(page?: number, count?: number) {
    return this.get<Pokemon.Card[]>('/cards', {
      params: { page: page || 1, limit: count || 300 }
    });
  }

  getCard(id: string) {
    return this.get<Pokemon.Card>(`/cards/${id}`);
  }

  getCardsInSet(set: string) {
    return this.get<Pokemon.Card[]>(`/sets/${set}/cards`);
  }

  getCardsBatch(ids: string[]) {
    return this.get<{ data: Pokemon.Card[] }>('/cards/batch', {
      params: { ids: ids.join(',') }
    });
  }

  getByUseCases(tags: CardFunctionalTag[], limit = 60) {
    return this.get<{ data: (Pokemon.Card & { metaUsageCount: number })[]; tags: string[] }>(
      '/cards/use-case',
      { params: { tags: tags.join(','), limit } }
    );
  }
}
