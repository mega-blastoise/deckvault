import type { PokemonCardDefinition, AttackDefinition, EnergyType, WeaknessDefinition, ResistanceDefinition } from '../types/card';
import type { GameState, InPlayPokemon, PlayerId, PlayerState } from '../types/game';
import type { GameEvent } from '../types/event';
import type { TemporalEffect } from '../types/effect';
import { coinFlip } from '../rng';
import { otherPlayer, checkWinConditions, handleKnockOut, promoteFromBench } from './game';
import { resolveEffect } from '../effects/registry';
import {
  getDamageOutputModifiers,
  getDamageInputModifiers,
  resolveOnDamageTriggers,
  getEffectiveHpById,
  isNeutralizationZoneActive,
  checkSurvivalEffects
} from './modifiers';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DamageCalculation {
  readonly baseDamage: number;
  readonly attackModifier: number;
  readonly selfEffectModifier: number;
  readonly toolAndStadiumOutputBonus: number;
  readonly weaknessMultiplier: number;
  readonly weaknessFlat: number;
  readonly weaknessRemoved: boolean;
  readonly resistanceReduction: number;
  readonly targetEffectReduction: number;
  readonly toolAndStadiumInputReduction: number;
  readonly toolsToDiscard: ReadonlyArray<string>;
  readonly finalDamage: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getTopDef(
  state: GameState,
  instanceId: string
): PokemonCardDefinition | null {
  for (const ps of Object.values(state.players)) {
    const candidates = [ps.active, ...ps.bench].filter(Boolean) as InPlayPokemon[];
    for (const p of candidates) {
      if (p.instanceId !== instanceId) continue;
      const topId = p.evolutionStack[p.evolutionStack.length - 1] ?? p.instanceId;
      const instance = state.cardRegistry.get(topId);
      if (!instance) return null;
      const def = state.definitionRegistry.get(instance.definitionId);
      return def?.cardType === 'Pokemon' ? def : null;
    }
  }
  return null;
}

function isKnockedOut(state: GameState, pokemon: InPlayPokemon): boolean {
  const hp = getEffectiveHpById(state, pokemon);
  return pokemon.damageCounters * 10 >= hp;
}

function findPokemonOwner(state: GameState, instanceId: string): PlayerId | null {
  for (const [pid, ps] of Object.entries(state.players) as Array<[PlayerId, PlayerState]>) {
    if (ps.active?.instanceId === instanceId) return pid;
    if (ps.bench.some(b => b.instanceId === instanceId)) return pid;
  }
  return null;
}

function updatePokemon(
  state: GameState,
  instanceId: string,
  updater: (p: InPlayPokemon) => InPlayPokemon
): GameState {
  const newPlayers = { ...state.players };
  for (const pid of ['player1', 'player2'] as PlayerId[]) {
    const ps = newPlayers[pid]!;
    if (ps.active?.instanceId === instanceId) {
      newPlayers[pid] = { ...ps, active: updater(ps.active) };
      return { ...state, players: newPlayers };
    }
    const benchIdx = ps.bench.findIndex(b => b.instanceId === instanceId);
    if (benchIdx !== -1) {
      const newBench = [...ps.bench];
      newBench[benchIdx] = updater(ps.bench[benchIdx]!);
      newPlayers[pid] = { ...ps, bench: newBench };
      return { ...state, players: newPlayers };
    }
  }
  return state;
}

// ─── Tool Discard (for berry tools) ───────────────────────────────────────

function discardToolFromPokemon(
  state: GameState,
  pokemonInstanceId: string,
  toolInstanceId: string
): GameState {
  const owner = findPokemonOwner(state, pokemonInstanceId);
  if (!owner) return state;

  let s = updatePokemon(state, pokemonInstanceId, p => ({
    ...p,
    attachedTools: p.attachedTools.filter(t => t !== toolInstanceId)
  }));

  const ps = s.players[owner];
  s = {
    ...s,
    players: {
      ...s.players,
      [owner]: { ...ps, discard: [...ps.discard, toolInstanceId] }
    },
    eventLog: [...s.eventLog, { type: 'CARD_DISCARDED', player: owner, cardInstanceId: toolInstanceId } as GameEvent]
  };
  return s;
}

// ─── Damage Counter Placement (bypasses pipeline) ─────────────────────────

export function placeDamageCountersOn(
  state: GameState,
  targetInstanceId: string,
  counters: number,
  source: string
): GameState {
  const events: GameEvent[] = [
    { type: 'DAMAGE_COUNTERS_PLACED', targetInstanceId, counters, source }
  ];
  const updated = updatePokemon(state, targetInstanceId, p => ({
    ...p, damageCounters: p.damageCounters + counters
  }));
  return { ...updated, eventLog: [...updated.eventLog, ...events] };
}

// ─── Weakness / Resistance ────────────────────────────────────────────────

export function resolveWeakness(
  damage: number,
  attackerTypes: ReadonlyArray<EnergyType>,
  defenderWeaknesses: ReadonlyArray<WeaknessDefinition>
): { multiplier: number; flat: number } {
  for (const attackerType of attackerTypes) {
    const weakness = defenderWeaknesses.find(w => w.type === attackerType);
    if (!weakness) continue;
    if (weakness.value === 'x2') return { multiplier: 2, flat: 0 };
    const flatMatch = weakness.value.match(/^\+(\d+)$/);
    if (flatMatch) return { multiplier: 1, flat: parseInt(flatMatch[1]!, 10) };
  }
  return { multiplier: 1, flat: 0 };
}

export function resolveResistance(
  damage: number,
  attackerTypes: ReadonlyArray<EnergyType>,
  defenderResistances: ReadonlyArray<ResistanceDefinition>
): number {
  for (const attackerType of attackerTypes) {
    const resistance = defenderResistances.find(r => r.type === attackerType);
    if (!resistance) continue;
    const flatMatch = resistance.value.match(/^-(\d+)$/);
    if (flatMatch) return parseInt(flatMatch[1]!, 10);
  }
  return 0;
}

// ─── Confusion ────────────────────────────────────────────────────────────

export function resolveConfusion(
  state: GameState,
  attacker: InPlayPokemon
): { readonly proceed: boolean; readonly newState: GameState } {
  if (!attacker.specialConditions.includes('Confused')) {
    return { proceed: true, newState: state };
  }

  const { result, nextState: rng } = coinFlip(state.rngState);
  let s: GameState = {
    ...state,
    rngState: rng,
    eventLog: [
      ...state.eventLog,
      { type: 'COIN_FLIPPED', result, reason: 'confusion_check' } as GameEvent
    ]
  };

  if (result === 'heads') {
    return { proceed: true, newState: s };
  }

  // Tails: 3 damage counters on self, attack cancelled
  s = placeDamageCountersOn(s, attacker.instanceId, 3, 'confusion');
  return { proceed: false, newState: s };
}

// ─── Damage Calculation (pure) ────────────────────────────────────────────

export function calculateDamage(
  attacker: InPlayPokemon,
  defender: InPlayPokemon,
  attack: AttackDefinition,
  attackerDef: PokemonCardDefinition,
  defenderDef: PokemonCardDefinition,
  state: GameState
): DamageCalculation {
  const baseDamage = attack.damage;
  const attackerPlayer = findPokemonOwner(state, attacker.instanceId) ?? state.activePlayer;
  const defenderPlayer = otherPlayer(attackerPlayer);

  // Neutralization Zone: ex cannot damage non-Rule-Box
  if (isNeutralizationZoneActive(state, attackerDef, defenderDef)) {
    return {
      baseDamage,
      attackModifier: 0,
      selfEffectModifier: 0,
      toolAndStadiumOutputBonus: 0,
      weaknessMultiplier: 1,
      weaknessFlat: 0,
      weaknessRemoved: false,
      resistanceReduction: 0,
      targetEffectReduction: 0,
      toolAndStadiumInputReduction: 0,
      toolsToDiscard: [],
      finalDamage: 0
    };
  }

  // Step 2: SINGLE step — attack modifiers + self-effects combined
  let attackModifier = 0;
  if (attack.damageModifier !== null && attack.effectId !== null) {
    // Effect would modify damage — but no handlers registered yet (SPEC_04)
    // resolveEffect is a no-op, so attackModifier stays 0
  }

  // Self temporal effects (damage_modifier type on attacker)
  const selfEffectModifier = state.temporalEffects
    .filter((e: TemporalEffect) =>
      e.type === 'damage_modifier' &&
      e.targetInstanceId === attacker.instanceId
    )
    .reduce((sum: number, e: TemporalEffect) => sum + (typeof e.payload['amount'] === 'number' ? (e.payload['amount'] as number) : 0), 0);

  // Tool and stadium output bonuses (attacker perspective)
  const outputMods = getDamageOutputModifiers(
    state, attacker, attackerDef, defender, defenderDef, attackerPlayer
  );
  const toolAndStadiumOutputBonus = outputMods.flatBonus;

  const runningTotal = baseDamage + attackModifier + selfEffectModifier + toolAndStadiumOutputBonus;

  // Tool and stadium input reductions + weakness removal (defender perspective)
  const inputMods = getDamageInputModifiers(
    state, defender, defenderDef, attacker, attackerDef, defenderPlayer
  );
  const toolAndStadiumInputReduction = inputMods.flatReduction;
  const weaknessRemoved = inputMods.removeWeakness;
  const toolsToDiscard = inputMods.toolsToDiscard;

  // 0-check: if running total <= 0, skip W/R entirely
  if (runningTotal <= 0) {
    return {
      baseDamage,
      attackModifier,
      selfEffectModifier,
      toolAndStadiumOutputBonus,
      weaknessMultiplier: 1,
      weaknessFlat: 0,
      weaknessRemoved,
      resistanceReduction: 0,
      targetEffectReduction: 0,
      toolAndStadiumInputReduction,
      toolsToDiscard,
      finalDamage: 0
    };
  }

  // Step 3: Weakness (skip if removed by Protective Goggles etc.)
  let weaknessMultiplier = 1;
  let weaknessFlat = 0;
  if (!weaknessRemoved) {
    const weakness = resolveWeakness(runningTotal, attackerDef.types, defenderDef.weaknesses);
    weaknessMultiplier = weakness.multiplier;
    weaknessFlat = weakness.flat;
  }
  const afterWeakness = (runningTotal * weaknessMultiplier) + weaknessFlat;

  // Step 4: Resistance
  const resistanceReduction = resolveResistance(
    afterWeakness, attackerDef.types, defenderDef.resistances
  );
  const afterResistance = afterWeakness - resistanceReduction;

  // Step 5: Target damage reduction effects (temporal)
  const targetEffectReduction = state.temporalEffects
    .filter((e: TemporalEffect) =>
      e.type === 'damage_reduction' &&
      e.targetInstanceId === defender.instanceId
    )
    .reduce((sum: number, e: TemporalEffect) => sum + (typeof e.payload['amount'] === 'number' ? (e.payload['amount'] as number) : 0), 0);

  // Step 6: Tool and stadium input reduction
  const finalDamage = Math.max(0, afterResistance - targetEffectReduction - toolAndStadiumInputReduction);

  return {
    baseDamage,
    attackModifier,
    selfEffectModifier,
    toolAndStadiumOutputBonus,
    weaknessMultiplier,
    weaknessFlat,
    weaknessRemoved,
    resistanceReduction,
    targetEffectReduction,
    toolAndStadiumInputReduction,
    toolsToDiscard,
    finalDamage
  };
}

// ─── Deal Damage (pipeline path) ──────────────────────────────────────────

function dealDamage(
  state: GameState,
  targetInstanceId: string,
  calc: DamageCalculation,
  source: string
): GameState {
  if (calc.finalDamage <= 0) return state;
  const counters = Math.floor(calc.finalDamage / 10);
  const events: GameEvent[] = [
    { type: 'DAMAGE_DEALT', targetInstanceId, amount: calc.finalDamage, source }
  ];
  const updated = updatePokemon(state, targetInstanceId, p => ({
    ...p, damageCounters: p.damageCounters + counters
  }));
  return { ...updated, eventLog: [...updated.eventLog, ...events] };
}

// ─── Bench Damage ─────────────────────────────────────────────────────────

export function dealBenchDamage(
  state: GameState,
  targetInstanceId: string,
  amount: number
): GameState {
  const def = getTopDef(state, targetInstanceId);
  if (def?.cardType === 'Pokemon' && def.subtypes.includes('Tera')) return state;
  return placeDamageCountersOn(state, targetInstanceId, Math.floor(amount / 10), 'bench_damage');
}

// ─── Self-Damage / Recoil ─────────────────────────────────────────────────

export function dealSelfDamage(
  state: GameState,
  attackerInstanceId: string,
  amount: number
): GameState {
  return placeDamageCountersOn(state, attackerInstanceId, Math.floor(amount / 10), 'self_damage');
}

// ─── Energy Discard ───────────────────────────────────────────────────────

export function discardEnergyFromPokemon(
  state: GameState,
  pokemonInstanceId: string,
  energyInstanceIds: ReadonlyArray<string>
): GameState {
  const owner = findPokemonOwner(state, pokemonInstanceId);
  if (!owner) return state;

  const toRemove = new Set(energyInstanceIds);
  let s = updatePokemon(state, pokemonInstanceId, p => ({
    ...p,
    attachedEnergy: p.attachedEnergy.filter(e => !toRemove.has(e))
  }));

  const playerState = s.players[owner];
  const events: GameEvent[] = energyInstanceIds.map(eid => ({
    type: 'CARD_DISCARDED' as const,
    player: owner,
    cardInstanceId: eid
  }));

  s = {
    ...s,
    players: {
      ...s.players,
      [owner]: {
        ...playerState,
        discard: [...playerState.discard, ...energyInstanceIds]
      }
    },
    eventLog: [...s.eventLog, ...events]
  };

  return s;
}

// ─── KO Check ─────────────────────────────────────────────────────────────

export function checkKnockOuts(state: GameState): GameState {
  const kos: Array<{ instanceId: string }> = [];
  for (const ps of Object.values(state.players)) {
    if (ps.active && isKnockedOut(state, ps.active)) {
      kos.push({ instanceId: ps.active.instanceId });
    }
    for (const b of ps.bench) {
      if (isKnockedOut(state, b)) {
        kos.push({ instanceId: b.instanceId });
      }
    }
  }

  let s = state;
  for (const ko of kos) {
    s = handleKnockOut(s, ko.instanceId);
    if (s.phase === 'finished') return s;
  }
  return checkWinConditions(s);
}

// ─── Resolve Attack (main entry point) ────────────────────────────────────

export function resolveAttack(state: GameState, attackIndex: number): GameState {
  const activePlayer = state.activePlayer;
  const defender = otherPlayer(activePlayer);
  const attackerPokemon = state.players[activePlayer].active;
  const defenderPokemon = state.players[defender].active;

  if (!attackerPokemon || !defenderPokemon) return state;

  const attackerDef = getTopDef(state, attackerPokemon.instanceId);
  const defenderDef = getTopDef(state, defenderPokemon.instanceId);
  if (!attackerDef || !defenderDef) return state;

  let attack: AttackDefinition | null = null;
  let isTm = false;

  if (attackIndex < 100) {
    attack = attackerDef.attacks[attackIndex] ?? null;
  } else {
    isTm = true;
    const tmIdx = attackIndex - 100;
    const toolId = attackerPokemon.attachedTools[tmIdx];
    if (!toolId) return state;
    const toolInstance = state.cardRegistry.get(toolId);
    if (!toolInstance) return state;
    const toolDef = state.definitionRegistry.get(toolInstance.definitionId);
    if (!toolDef || toolDef.cardType !== 'Trainer') return state;
    // TM attack — resolve via effect registry (no-op in SPEC_03)
    const effectResult = resolveEffect(toolDef.effectId, {
      state,
      actingPlayer: activePlayer,
      targets: [defenderPokemon.instanceId]
    });
    if (!effectResult.ok) return state;
    return checkKnockOuts(effectResult.value);
  }

  if (!attack) return state;

  let s = state;

  // Step A: Pre-attack effects (attack_prevention temporal effects)
  const preventionEffects = s.temporalEffects.filter(
    (e: TemporalEffect) => e.type === 'attack_prevention'
  );
  for (const effect of preventionEffects) {
    // Only applies if the target matches the CURRENT defender's Active instanceId
    if (effect.targetInstanceId === attackerPokemon.instanceId) {
      // Effect targets our attacker — attack is cancelled
      // Remove the effect from state
      s = {
        ...s,
        temporalEffects: s.temporalEffects.filter((e: TemporalEffect) => e.id !== effect.id)
      };
      return s;
    }
  }

  // Step B: Confusion check
  const confusionResult = resolveConfusion(s, attackerPokemon);
  s = confusionResult.newState;
  if (!confusionResult.proceed) {
    return s;
  }

  // Steps C/D/E: attack choices/requirements — SPEC_04 territory, no-op

  // Step F: Calculate and deal damage
  if (attack.damage > 0 || hasNonZeroDamageModifiers(s, attackerPokemon, attack)) {
    const calc = calculateDamage(
      attackerPokemon, defenderPokemon, attack,
      attackerDef, defenderDef, s
    );

    if (calc.finalDamage > 0) {
      // Capture pre-damage state for Survival Brace: was the defender at full HP?
      const defenderDamageCountersBefore = defenderPokemon.damageCounters;

      s = dealDamage(s, defenderPokemon.instanceId, calc, attack.name);

      // Discard berry tools that triggered
      for (const toolId of calc.toolsToDiscard) {
        s = discardToolFromPokemon(s, defenderPokemon.instanceId, toolId);
      }

      // On-damage triggers (Rocky Helmet, Lucky Helmet, etc.)
      s = resolveOnDamageTriggers(s, defenderPokemon.instanceId, attackerPokemon.instanceId, calc.finalDamage);

      // Survival Brace: check before KO processing, while we still know pre-damage HP
      const defenderAfterDamage = s.players[defender].active;
      if (defenderAfterDamage && defenderAfterDamage.instanceId === defenderPokemon.instanceId) {
        const effectiveHp = getEffectiveHpById(s, defenderAfterDamage);
        const isKod = defenderAfterDamage.damageCounters * 10 >= effectiveHp;
        if (isKod) {
          const survivalResult = checkSurvivalEffects(
            s,
            defenderAfterDamage,
            defenderDef,
            defenderDamageCountersBefore === 0,
            defender
          );
          if (survivalResult.survived) {
            s = survivalResult.newState;
          }
        }
      }
    }
  }

  // Attack side effects: resolveEffect (no-op for SPEC_03)
  if (attack.effectId) {
    const effectResult = resolveEffect(attack.effectId, {
      state: s,
      actingPlayer: activePlayer,
      targets: [defenderPokemon.instanceId]
    });
    if (effectResult.ok) {
      s = effectResult.value;
    }
  }

  // Step G: Check KOs
  s = checkKnockOuts(s);

  return s;
}

function hasNonZeroDamageModifiers(
  state: GameState,
  attacker: InPlayPokemon,
  attack: AttackDefinition
): boolean {
  if (attack.damageModifier !== null) return true;
  return state.temporalEffects.some(
    (e: TemporalEffect) => e.type === 'damage_modifier' && e.targetInstanceId === attacker.instanceId
  );
}
