import { useMutation } from '@tanstack/react-query';
import { ScaffoldService } from '../services/ScaffoldService';
import type { ScaffoldRequest } from '../../types/scaffold';

const service = new ScaffoldService();

export function useScaffold() {
  return useMutation({
    mutationFn: (req: ScaffoldRequest) => service.generate(req)
  });
}
