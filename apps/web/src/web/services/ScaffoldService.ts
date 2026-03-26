import { APIModel, getBaseAPIURL } from './APIModel';
import type { ScaffoldDeck, ScaffoldRequest } from '../../types/scaffold';

export class ScaffoldService extends APIModel {
  constructor() {
    super({
      baseURL: getBaseAPIURL(),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });
  }

  generate(req: ScaffoldRequest) {
    return this.post<{ data: ScaffoldDeck }>('/scaffold', req);
  }
}
