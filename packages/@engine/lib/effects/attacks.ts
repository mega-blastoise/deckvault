import type { GameState } from '../types/game';
import type { TemporalEffect } from '../types/effect';
import type { AttackContext } from './registry';
import { registerAttackEffect } from './registry';
import {
  healDamage,
  applyCondition,
  flipCoin,
  discardAllEnergy,
  discardEnergy,
  switchActive,
  drawCards
} from './primitives';
import { dealBenchDamage, placeDamageCountersOn } from '../core/combat';

// ─── Heal Self ───────────────────────────────────────────────────────────
// "Heal N damage from this Pokemon"

function healSelf(amount: number) {
  return (state: GameState, ctx: AttackContext): GameState => {
    return healDamage(state, ctx.player, ctx.attacker.instanceId, amount);
  };
}

// ─── Apply Condition to Defender ─────────────────────────────────────────
// "Your opponent's Active Pokemon is now [Condition]"

function applyConditionToDefender(condition: 'Asleep' | 'Burned' | 'Confused' | 'Paralyzed' | 'Poisoned') {
  return (state: GameState, ctx: AttackContext): GameState => {
    return applyCondition(state, ctx.opponent, ctx.defender.instanceId, condition);
  };
}

// ─── Coin Flip + Bonus Damage ────────────────────────────────────────────
// "Flip a coin. If heads, this attack does N more damage"

function coinFlipBonusDamage(bonusAmount: number) {
  return (state: GameState, ctx: AttackContext): GameState => {
    const { result, newState } = flipCoin(state, 'coin_flip_bonus_damage');
    if (result === 'heads') {
      return placeDamageCountersOn(newState, ctx.defender.instanceId, Math.floor(bonusAmount / 10), 'bonus_damage');
    }
    return newState;
  };
}

// ─── Coin Flip + Apply Condition ─────────────────────────────────────────
// "Flip a coin. If heads, opponent's Active is now [Condition]"

function coinFlipApplyCondition(condition: 'Asleep' | 'Burned' | 'Confused' | 'Paralyzed' | 'Poisoned') {
  return (state: GameState, ctx: AttackContext): GameState => {
    const { result, newState } = flipCoin(state, 'coin_flip_condition');
    if (result === 'heads') {
      return applyCondition(newState, ctx.opponent, ctx.defender.instanceId, condition);
    }
    return newState;
  };
}

// ─── Switch Self After Attack ────────────────────────────────────────────
// "You may switch this Pokemon with 1 of your Benched Pokemon"

function maySwitchSelfAfterAttack() {
  return (state: GameState, ctx: AttackContext): GameState => {
    const player = state.players[ctx.player];
    if (player.bench.length === 0) return state;

    const options = player.bench.map(b => b.instanceId);
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options,
      min: 0,
      max: 1,
      reason: 'You may switch this Pokemon with a Benched Pokemon'
    });

    const chosen = choice[0];
    if (!chosen || !options.includes(chosen)) return state;

    return switchActive(state, ctx.player, chosen);
  };
}

// ─── Discard All Energy From Self ────────────────────────────────────────
// "Discard all Energy from this Pokemon"

function discardAllEnergyFromSelf() {
  return (state: GameState, ctx: AttackContext): GameState => {
    return discardAllEnergy(state, ctx.player, ctx.attacker.instanceId);
  };
}

// ─── Discard N Energy From Self ──────────────────────────────────────────
// "Discard an Energy from this Pokemon"

function discardEnergyFromSelf(count: number) {
  return (state: GameState, ctx: AttackContext): GameState => {
    return discardEnergy(state, ctx.player, ctx.attacker.instanceId, count);
  };
}

// ─── Bench Snipe ─────────────────────────────────────────────────────────
// "Also does N damage to 1 of opponent's Benched Pokemon"

function sniperBench(amount: number) {
  return (state: GameState, ctx: AttackContext): GameState => {
    const opponentBench = state.players[ctx.opponent].bench;
    if (opponentBench.length === 0) return state;

    const options = opponentBench.map(b => b.instanceId);
    const choice = ctx.choiceResolver({
      type: 'select_pokemon',
      player: ctx.player,
      options,
      min: 1,
      max: 1,
      reason: 'Choose a Benched Pokemon to deal damage to'
    });

    const chosen = choice[0];
    if (!chosen || !options.includes(chosen)) return state;

    return dealBenchDamage(state, chosen, amount);
  };
}

// ─── Lock Self Next Turn ─────────────────────────────────────────────────
// "During your next turn, this Pokemon can't attack"

function lockSelfNextTurn() {
  return (state: GameState, ctx: AttackContext): GameState => {
    const effect: TemporalEffect = {
      id: `attack_lock_${ctx.attacker.instanceId}_${state.turnNumber}`,
      type: 'attack_lock',
      sourceInstanceId: ctx.attacker.instanceId,
      sourceType: 'attack',
      targetInstanceId: ctx.attacker.instanceId,
      expiresOnTurn: null,
      expiresAt: 'end_of_next_turn',
      payload: {}
    };
    return {
      ...state,
      temporalEffects: [...state.temporalEffects, effect]
    };
  };
}

// ─── Prevent Damage Next Turn ────────────────────────────────────────────
// "During opponent's next turn, prevent all damage to this Pokemon"

function preventDamageNextTurn() {
  return (state: GameState, ctx: AttackContext): GameState => {
    const effect: TemporalEffect = {
      id: `damage_prevention_${ctx.attacker.instanceId}_${state.turnNumber}`,
      type: 'damage_prevention',
      sourceInstanceId: ctx.attacker.instanceId,
      sourceType: 'attack',
      targetInstanceId: ctx.attacker.instanceId,
      expiresOnTurn: null,
      expiresAt: 'end_of_opponent_turn',
      payload: { amount: 999999 }
    };
    return {
      ...state,
      temporalEffects: [...state.temporalEffects, effect]
    };
  };
}

// ─── Draw Cards After Attack ─────────────────────────────────────────────
// "Draw N cards"

function drawCardsAfterAttack(count: number) {
  return (state: GameState, ctx: AttackContext): GameState => {
    return drawCards(state, ctx.player, count);
  };
}

// ─── Registration ────────────────────────────────────────────────────────

export function registerAllAttacks(): void {
  // Generic pattern handlers registered by pattern name.
  // Individual card attacks map to these via effectId or attack name.
  registerAttackEffect('heal_self_10', healSelf(10));
  registerAttackEffect('heal_self_20', healSelf(20));
  registerAttackEffect('heal_self_30', healSelf(30));
  registerAttackEffect('heal_self_50', healSelf(50));

  registerAttackEffect('apply_burned', applyConditionToDefender('Burned'));
  registerAttackEffect('apply_poisoned', applyConditionToDefender('Poisoned'));
  registerAttackEffect('apply_asleep', applyConditionToDefender('Asleep'));
  registerAttackEffect('apply_confused', applyConditionToDefender('Confused'));
  registerAttackEffect('apply_paralyzed', applyConditionToDefender('Paralyzed'));

  registerAttackEffect('coin_flip_bonus_10', coinFlipBonusDamage(10));
  registerAttackEffect('coin_flip_bonus_20', coinFlipBonusDamage(20));
  registerAttackEffect('coin_flip_bonus_30', coinFlipBonusDamage(30));
  registerAttackEffect('coin_flip_bonus_40', coinFlipBonusDamage(40));
  registerAttackEffect('coin_flip_bonus_50', coinFlipBonusDamage(50));
  registerAttackEffect('coin_flip_bonus_60', coinFlipBonusDamage(60));

  registerAttackEffect('coin_flip_paralyzed', coinFlipApplyCondition('Paralyzed'));
  registerAttackEffect('coin_flip_confused', coinFlipApplyCondition('Confused'));
  registerAttackEffect('coin_flip_asleep', coinFlipApplyCondition('Asleep'));
  registerAttackEffect('coin_flip_burned', coinFlipApplyCondition('Burned'));
  registerAttackEffect('coin_flip_poisoned', coinFlipApplyCondition('Poisoned'));

  registerAttackEffect('may_switch_self', maySwitchSelfAfterAttack());
  registerAttackEffect('discard_all_energy_self', discardAllEnergyFromSelf());
  registerAttackEffect('discard_1_energy_self', discardEnergyFromSelf(1));
  registerAttackEffect('discard_2_energy_self', discardEnergyFromSelf(2));
  registerAttackEffect('discard_3_energy_self', discardEnergyFromSelf(3));

  registerAttackEffect('snipe_bench_10', sniperBench(10));
  registerAttackEffect('snipe_bench_20', sniperBench(20));
  registerAttackEffect('snipe_bench_30', sniperBench(30));
  registerAttackEffect('snipe_bench_40', sniperBench(40));

  registerAttackEffect('lock_self_next_turn', lockSelfNextTurn());
  registerAttackEffect('prevent_damage_next_turn', preventDamageNextTurn());

  registerAttackEffect('draw_1', drawCardsAfterAttack(1));
  registerAttackEffect('draw_2', drawCardsAfterAttack(2));
  registerAttackEffect('draw_3', drawCardsAfterAttack(3));
}

// Export individual factories for direct use / testing
export {
  healSelf,
  applyConditionToDefender,
  coinFlipBonusDamage,
  coinFlipApplyCondition,
  maySwitchSelfAfterAttack,
  discardAllEnergyFromSelf,
  discardEnergyFromSelf,
  sniperBench,
  lockSelfNextTurn,
  preventDamageNextTurn,
  drawCardsAfterAttack
};

registerAllAttacks();
