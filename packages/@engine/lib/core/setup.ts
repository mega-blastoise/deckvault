import type { CardDefinition } from '../types/card';
import type { CardInstance } from '../types/game';

export function hasBasicPokemon(
  hand: ReadonlyArray<string>,
  cardRegistry: ReadonlyMap<string, CardInstance>,
  definitionRegistry: ReadonlyMap<string, CardDefinition>
): boolean {
  return hand.some(instanceId => {
    const instance = cardRegistry.get(instanceId);
    if (!instance) return false;
    const def = definitionRegistry.get(instance.definitionId);
    return def?.cardType === 'Pokemon' && def.stage === 'Basic';
  });
}
