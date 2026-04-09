import type { InPlayPokemon, SpecialCondition } from '../types/game';

// Rotation-based conditions are mutually exclusive (rulebook p.16).
// Only one of Asleep/Confused/Paralyzed can be active at a time.
const ROTATION_CONDITIONS: ReadonlySet<SpecialCondition> = new Set<SpecialCondition>([
  'Asleep', 'Confused', 'Paralyzed'
]);

// Apply a Special Condition to an InPlayPokemon, enforcing mutual exclusivity.
// Returns a new InPlayPokemon with the condition applied (pure — no mutation).
export function applySpecialCondition(
  pokemon: InPlayPokemon,
  condition: SpecialCondition
): InPlayPokemon {
  let conditions = [...pokemon.specialConditions];

  if (ROTATION_CONDITIONS.has(condition)) {
    // Remove any existing rotation-based condition before applying the new one.
    conditions = conditions.filter(c => !ROTATION_CONDITIONS.has(c));
  } else {
    // Burned and Poisoned cannot stack — remove existing instance of same condition.
    conditions = conditions.filter(c => c !== condition);
  }

  conditions.push(condition);
  return { ...pokemon, specialConditions: conditions };
}

// Remove a specific Special Condition from an InPlayPokemon.
export function removeSpecialCondition(
  pokemon: InPlayPokemon,
  condition: SpecialCondition
): InPlayPokemon {
  return {
    ...pokemon,
    specialConditions: pokemon.specialConditions.filter(c => c !== condition)
  };
}

// Remove all Special Conditions (called on zone change or evolution — rulebook p.15-16).
export function clearSpecialConditions(pokemon: InPlayPokemon): InPlayPokemon {
  return { ...pokemon, specialConditions: [] };
}
