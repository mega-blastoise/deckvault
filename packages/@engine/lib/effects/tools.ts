import type { GameState } from '../types/game';
import type { TrainerContext } from './registry';
import { registerTrainerEffect } from './registry';

// Pokemon Tool handlers are no-ops: their "effect" is being attached to a Pokemon.
// All passive modifier logic lives in core/modifiers.ts and is queried by the
// damage pipeline, retreat/attack cost checks, HP calculations, and KO handling.
// Tools only need a registry entry so resolveEffect recognizes the effectId.

function noOp(state: GameState, _ctx: TrainerContext): GameState {
  return state;
}

export function registerAllTools(): void {
  // === Damage Output Modifiers (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect('Vitality Band', noOp);
  registerTrainerEffect('Defiance Band', noOp);
  registerTrainerEffect('Brave Bangle', noOp);
  registerTrainerEffect('Choice Belt', noOp);
  registerTrainerEffect('Maximum Belt', noOp);
  registerTrainerEffect('Light Ball', noOp);
  registerTrainerEffect('Binding Mochi', noOp);
  registerTrainerEffect("Hop's Choice Band", noOp);
  registerTrainerEffect('Future Booster Energy Capsule', noOp);

  // === Damage Reduction Modifiers (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect('Defiance Vest', noOp);
  registerTrainerEffect('Rigid Band', noOp);
  registerTrainerEffect('Rock Chestplate', noOp);
  registerTrainerEffect('Sacred Charm', noOp);
  registerTrainerEffect('Thick Scale', noOp);

  // === Type-Berry Damage Reduction (modifier-only: triggers discard via core/modifiers.ts) ===
  registerTrainerEffect('Babiri Berry', noOp);
  registerTrainerEffect('Colbur Berry', noOp);
  registerTrainerEffect('Haban Berry', noOp);
  registerTrainerEffect('Occa Berry', noOp);
  registerTrainerEffect('Passho Berry', noOp);
  registerTrainerEffect('Payapa Berry', noOp);

  // === Retreat Cost Modifiers (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect('Air Balloon', noOp);
  registerTrainerEffect('Big Air Balloon', noOp);
  registerTrainerEffect('Rescue Board', noOp);
  registerTrainerEffect('Gravity Gemstone', noOp);

  // === Energy Cost Modifiers (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect('Counter Gain', noOp);
  registerTrainerEffect('Sparkling Crystal', noOp);

  // === HP Modifiers (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect("Hero's Cape", noOp);
  registerTrainerEffect('Bravery Charm', noOp);
  registerTrainerEffect("Cynthia's Power Weight", noOp);
  registerTrainerEffect('Luxurious Cape', noOp);
  registerTrainerEffect('Ancient Booster Energy Capsule', noOp);

  // === Weakness Removal (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect('Protective Goggles', noOp);

  // === On-Damage Triggers (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect('Rocky Helmet', noOp);
  registerTrainerEffect('Punk Helmet', noOp);
  registerTrainerEffect('Deluxe Bomb', noOp);
  registerTrainerEffect('Lucky Helmet', noOp);
  registerTrainerEffect('Handheld Fan', noOp);
  registerTrainerEffect("Team Rocket's Hypnotizer", noOp);

  // === On-KO Triggers (modifier-only: logic in core/modifiers.ts) ===
  registerTrainerEffect('Exp. Share', noOp);
  registerTrainerEffect('Amulet of Hope', noOp);
  registerTrainerEffect('Cursed Duster', noOp);
  registerTrainerEffect('Heavy Baton', noOp);
  registerTrainerEffect("Lillie's Pearl", noOp);
  registerTrainerEffect('Survival Brace', noOp);

  // === Passive State Modifiers (no-op: needs event system for full implementation) ===
  registerTrainerEffect('Patrol Cap', noOp); // While Active, opponent can't discard your deck cards
  registerTrainerEffect('Powerglass', noOp); // End of turn, if Active, attach Basic Energy from discard

  // === Technical Machines (attack granted — handled by TM attack flow) ===
  registerTrainerEffect('Technical Machine: Blindside', noOp);
  registerTrainerEffect('Technical Machine: Crisis Punch', noOp);
  registerTrainerEffect('Technical Machine: Devolution', noOp);
  registerTrainerEffect('Technical Machine: Evolution', noOp);
  registerTrainerEffect('Technical Machine: Fluorite', noOp);
  registerTrainerEffect('Technical Machine: Turbo Energize', noOp);
}

registerAllTools();
