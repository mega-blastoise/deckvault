import { useQuery } from '@tanstack/react-query';
import { CardsService } from '../services/CardsService';
import type { CardFunctionalTag } from '../../types/card-tags';

const service = new CardsService();

export function useUseCaseCards(tags: CardFunctionalTag[], limit = 60) {
  return useQuery({
    queryKey: ['cards', 'use-case', tags, limit],
    queryFn: () => service.getByUseCases(tags, limit),
    enabled: tags.length > 0,
    staleTime: 5 * 60 * 1000
  });
}
