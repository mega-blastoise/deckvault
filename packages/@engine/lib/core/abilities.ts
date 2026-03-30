import type { GameState, InPlayPokemon, PlayerId } from '../types/game';
import type { TrainerCardDefinition } from '../types/card';

function getStadiumDef(state: GameState): TrainerCardDefinition | null {
  if (!state.stadium) return null;
  const inst = state.cardRegistry.get(state.stadium.cardInstanceId);
  if (!inst) return null;
  const def = state.definitionRegistry.get(inst.definitionId);
  return def?.cardType === 'Trainer' ? def : null;
}

function getTopDef(state: GameState, pokemon: InPlayPokemon) {
  const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
  const instance = state.cardRegistry.get(topId);
  if (!instance) return null;
  const def = state.definitionRegistry.get(instance.definitionId);
  return def?.cardType === 'Pokemon' ? def : null;
}

export function canUseAbility(
  state: GameState,
  _player: PlayerId,
  pokemon: InPlayPokemon,
  abilityIndex: number
): boolean {
  const def = getTopDef(state, pokemon);
  if (!def) return false;

  const ability = def.abilities[abilityIndex];
  if (!ability) return false;

  const hasAbilityLock = state.temporalEffects.some(
    e => e.type === 'ability_lock' &&
      (e.targetInstanceId === null || e.targetInstanceId === pokemon.instanceId)
  );
  if (hasAbilityLock) return false;

  const stadiumName = getStadiumDef(state)?.name;
  if (stadiumName === "Team Rocket's Watchtower") {
    if (def.types.includes('Colorless')) return false;
  }

  return true;
}
