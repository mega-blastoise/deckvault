import { type Pokemon } from '@pokemon/clients';
import { APIModel, getBaseAPIURL } from './APIModel';

export class SetsService extends APIModel implements APIModel {
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

  getSets(page?: number, count?: number) {
    return this.get<Pokemon.Set[]>('/sets', {
      params: { page: page || 1, limit: count || 300 }
    });
  }

  getSet(id: string) {
    return this.get<Pokemon.Set>(`/sets/${id}`);
  }

  getCardsInSet(set: string) {
    return this.get<Pokemon.Card[]>(`/sets/${set}/cards`, {
      params: { limit: 500 }
    });
  }
}
