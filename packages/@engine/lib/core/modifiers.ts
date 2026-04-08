import type {
  PokemonCardDefinition,
  TrainerCardDefinition,
  EnergyType,
  AttackDefinition
} from '../types/card';
import type {
  GameState,
  InPlayPokemon,
  PlayerId,
  PlayerState,
  StadiumState
} from '../types/game';
import type { GameEvent } from '../types/event';
import { otherPlayer } from './game';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DamageOutputModifierResult {
  readonly flatBonus: number;
}

export interface DamageInputModifierResult {
  readonly flatReduction: number;
  readonly removeWeakness: boolean;
  readonly toolsToDiscard: ReadonlyArray<string>;
}

export interface RetreatCostModifierResult {
  readonly flatReduction: number;
  readonly flatIncrease: number;
  readonly setToZero: boolean;
}

export interface HpModifierResult {
  readonly flatBonus: number;
}

export interface AttackCostModifierResult {
  readonly colorlessReduction: number;
  readonly colorlessIncrease: number;
}

export interface PrizeModifierResult {
  readonly adjustment: number;
}

export interface OnDamageTriggerResult {
  readonly newState: GameState;
}

export interface OnKOTriggerResult {
  readonly newState: GameState;
}

export interface SurvivalResult {
  readonly survived: boolean;
  readonly newState: GameState;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getStadiumDef(state: GameState): TrainerCardDefinition | null {
  if (!state.stadium) return null;
  const inst = state.cardRegistry.get(state.stadium.cardInstanceId);
  if (!inst) return null;
  const def = state.definitionRegistry.get(inst.definitionId);
  return def?.cardType === 'Trainer' ? def : null;
}

export function isJammingTowerActive(state: GameState): boolean {
  const def = getStadiumDef(state);
  return def !== null && def.name === 'Jamming Tower';
}

function getTopDef(state: GameState, pokemon: InPlayPokemon): PokemonCardDefinition | null {
  const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
  const instance = state.cardRegistry.get(topId);
  if (!instance) return null;
  const def = state.definitionRegistry.get(instance.definitionId);
  return def?.cardType === 'Pokemon' ? def : null;
}

function getToolDefs(
  state: GameState,
  pokemon: InPlayPokemon
): ReadonlyArray<{ def: TrainerCardDefinition; instanceId: string }> {
  return pokemon.attachedTools
    .map(toolId => {
      const inst = state.cardRegistry.get(toolId);
      if (!inst) return null;
      const def = state.definitionRegistry.get(inst.definitionId);
      return def?.cardType === 'Trainer' ? { def, instanceId: toolId } : null;
    })
    .filter((d): d is { def: TrainerCardDefinition; instanceId: string } => d !== null);
}

function hasRuleBox(def: PokemonCardDefinition): boolean {
  return def.subtypes.some(s => s === 'ex' || s === 'MegaEvolutionEx');
}

function hasSubtype(def: PokemonCardDefinition, subtype: string): boolean {
  return (def.subtypes as ReadonlyArray<string>).includes(subtype);
}

function isNamedPokemon(def: PokemonCardDefinition, ownerName: string): boolean {
  return def.name.startsWith(`${ownerName}'s `);
}

function updatePokemonInPlay(
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

function findPokemonOwner(state: GameState, instanceId: string): PlayerId | null {
  for (const [pid, ps] of Object.entries(state.players) as Array<[PlayerId, PlayerState]>) {
    if (ps.active?.instanceId === instanceId) return pid;
    if (ps.bench.some(b => b.instanceId === instanceId)) return pid;
  }
  return null;
}

function discardTool(state: GameState, pokemonInstanceId: string, toolInstanceId: string): GameState {
  const owner = findPokemonOwner(state, pokemonInstanceId);
  if (!owner) return state;

  let s = updatePokemonInPlay(state, pokemonInstanceId, p => ({
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

function addEvents(state: GameState, events: ReadonlyArray<GameEvent>): GameState {
  return { ...state, eventLog: [...state.eventLog, ...events] };
}

// ─── Berry type mapping ──────────────────────────────────────────────────

const BERRY_TYPE_MAP: ReadonlyArray<{ name: string; type: EnergyType }> = [
  { name: 'Babiri Berry', type: 'Metal' },
  { name: 'Colbur Berry', type: 'Darkness' },
  { name: 'Haban Berry', type: 'Dragon' },
  { name: 'Occa Berry', type: 'Fire' },
  { name: 'Passho Berry', type: 'Water' },
  { name: 'Payapa Berry', type: 'Psychic' }
];

// ─── Damage Output Modifiers ─────────────────────────────────────────────

export function getDamageOutputModifiers(
  state: GameState,
  attacker: InPlayPokemon,
  attackerDef: PokemonCardDefinition,
  defender: InPlayPokemon,
  defenderDef: PokemonCardDefinition,
  attackerPlayer: PlayerId
): DamageOutputModifierResult {
  let flatBonus = 0;
  const jammingTower = isJammingTowerActive(state);
  const defenderIsActive = state.players[otherPlayer(attackerPlayer)].active?.instanceId === defender.instanceId;

  // Tool modifiers (suppressed by Jamming Tower)
  if (!jammingTower) {
    const tools = getToolDefs(state, attacker);
    const attackerPlayerState = state.players[attackerPlayer];
    const opponentPlayerState = state.players[otherPlayer(attackerPlayer)];
    const moreAttackerPrizes = attackerPlayerState.prizes.length > opponentPlayerState.prizes.length;

    for (const { def: tool } of tools) {
      if (tool.name === 'Vitality Band' && defenderIsActive) {
        flatBonus += 10;
      }
      if (tool.name === 'Defiance Band' && defenderIsActive && moreAttackerPrizes) {
        flatBonus += 30;
      }
      if (tool.name === 'Brave Bangle' && defenderIsActive && !hasRuleBox(attackerDef) && hasRuleBox(defenderDef)) {
        flatBonus += 30;
      }
      if (tool.name === 'Choice Belt' && defenderIsActive) {
        // +30 to V Pokemon (not in GHI Standard, but card exists)
        // V subtype isn't in PokemonSubtype, so this is effectively a no-op in GHI
        flatBonus += 0;
      }
      if (tool.name === 'Maximum Belt' && defenderIsActive && hasSubtype(defenderDef, 'ex')) {
        flatBonus += 50;
      }
      if (tool.name === 'Light Ball' && defenderIsActive && attackerDef.name === 'Pikachu ex' && hasSubtype(defenderDef, 'ex')) {
        flatBonus += 50;
      }
      if (tool.name === 'Binding Mochi' && attacker.specialConditions.includes('Poisoned')) {
        flatBonus += 40;
      }
      if (tool.name === "Hop's Choice Band" && isNamedPokemon(attackerDef, 'Hop') && defenderIsActive) {
        flatBonus += 30;
      }
      if (tool.name === 'Future Booster Energy Capsule' && hasSubtype(attackerDef, 'Future')) {
        flatBonus += 20;
      }
    }
  }

  // Stadium modifiers
  const stadiumDef = getStadiumDef(state);
  if (stadiumDef) {
    if (stadiumDef.name === 'Practice Studio' && attackerDef.stage === 'Stage1') {
      flatBonus += 10;
    }
    if (stadiumDef.name === 'Postwick' && isNamedPokemon(attackerDef, 'Hop')) {
      flatBonus += 30;
    }
    if (stadiumDef.name === 'Neutralization Zone' && !hasRuleBox(defenderDef) && hasRuleBox(attackerDef)) {
      // Non-Rule-Box defenders are immune to ex damage — zeroes out damage entirely
      // We return a large negative to cancel. Caller should handle this.
      // Actually: the spec says this prevents damage, so we'd need a separate flag.
      // For now, this is handled as a damage prevention check in the caller.
    }
  }

  return { flatBonus };
}

// ─── Damage Input Modifiers ──────────────────────────────────────────────

export function getDamageInputModifiers(
  state: GameState,
  defender: InPlayPokemon,
  defenderDef: PokemonCardDefinition,
  attacker: InPlayPokemon,
  attackerDef: PokemonCardDefinition,
  defenderPlayer: PlayerId
): DamageInputModifierResult {
  let flatReduction = 0;
  let removeWeakness = false;
  const toolsToDiscard: string[] = [];
  const jammingTower = isJammingTowerActive(state);

  // Tool modifiers (suppressed by Jamming Tower)
  if (!jammingTower) {
    const tools = getToolDefs(state, defender);
    const defenderPlayerState = state.players[defenderPlayer];
    const opponentPlayerState = state.players[otherPlayer(defenderPlayer)];
    const moreDefenderPrizes = defenderPlayerState.prizes.length > opponentPlayerState.prizes.length;

    for (const { def: tool, instanceId: toolId } of tools) {
      if (tool.name === 'Defiance Vest' && moreDefenderPrizes) {
        flatReduction += 40;
      }
      if (tool.name === 'Rigid Band' && defenderDef.stage === 'Stage1') {
        flatReduction += 30;
      }
      if (tool.name === 'Rock Chestplate' && defenderDef.types.includes('Fighting')) {
        flatReduction += 30;
      }
      if (tool.name === 'Sacred Charm' && attackerDef.abilities.length > 0) {
        flatReduction += 30;
      }
      if (tool.name === 'Thick Scale' && defenderDef.types.includes('Dragon')) {
        const reducedTypes: ReadonlyArray<EnergyType> = ['Grass', 'Fire', 'Water', 'Lightning'];
        if (attackerDef.types.some(t => reducedTypes.includes(t))) {
          flatReduction += 50;
        }
      }

      // Berry tools
      for (const berry of BERRY_TYPE_MAP) {
        if (tool.name === berry.name && attackerDef.types.includes(berry.type)) {
          flatReduction += 60;
          toolsToDiscard.push(toolId);
        }
      }

      // Weakness removal
      if (tool.name === 'Protective Goggles' && defenderDef.stage === 'Basic') {
        removeWeakness = true;
      }
    }
  }

  // Stadium modifiers
  const stadiumDef = getStadiumDef(state);
  if (stadiumDef) {
    if (stadiumDef.name === 'Full Metal Lab' && defenderDef.types.includes('Metal')) {
      flatReduction += 30;
    }
    if (stadiumDef.name === 'Granite Cave' && isNamedPokemon(defenderDef, 'Steven')) {
      flatReduction += 30;
    }
  }

  return { flatReduction, removeWeakness, toolsToDiscard };
}

// ─── Retreat Cost Modifiers ──────────────────────────────────────────────

export function getRetreatCostModifiers(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  player: PlayerId
): RetreatCostModifierResult {
  let flatReduction = 0;
  let flatIncrease = 0;
  let setToZero = false;
  const jammingTower = isJammingTowerActive(state);

  // Tool modifiers (suppressed by Jamming Tower)
  if (!jammingTower) {
    const tools = getToolDefs(state, pokemon);

    for (const { def: tool } of tools) {
      if (tool.name === 'Air Balloon') {
        flatReduction += 2;
      }
      if (tool.name === 'Big Air Balloon' && pokemonDef.stage === 'Stage2') {
        setToZero = true;
      }
      if (tool.name === 'Rescue Board') {
        const effectiveHp = getEffectiveHp(state, pokemon, pokemonDef, player);
        const remainingHp = effectiveHp - pokemon.damageCounters * 10;
        if (remainingHp <= 30) {
          setToZero = true;
        } else {
          flatReduction += 1;
        }
      }
      if (tool.name === 'Future Booster Energy Capsule' && hasSubtype(pokemonDef, 'Future')) {
        setToZero = true;
      }
      if (tool.name === "Hop's Choice Band" && isNamedPokemon(pokemonDef, 'Hop')) {
        flatReduction += 1;
      }
    }

    // Gravity Gemstone: check if the OPPONENT'S Active has it (affects both Actives)
    const opponent = otherPlayer(player);
    const opponentActive = state.players[opponent].active;
    if (opponentActive) {
      const opponentTools = getToolDefs(state, opponentActive);
      for (const { def: tool } of opponentTools) {
        if (tool.name === 'Gravity Gemstone') {
          flatIncrease += 1;
        }
      }
    }
    // Also check if this Pokemon's own Gravity Gemstone affects itself
    for (const { def: tool } of tools) {
      if (tool.name === 'Gravity Gemstone') {
        // Gravity Gemstone only applies while in Active Spot
        const isActive = state.players[player].active?.instanceId === pokemon.instanceId;
        if (isActive) {
          flatIncrease += 1;
        }
      }
    }
  }

  // Stadium modifiers
  const stadiumDef = getStadiumDef(state);
  if (stadiumDef) {
    if (stadiumDef.name === 'Beach Court' && pokemonDef.stage === 'Basic') {
      flatReduction += 1;
    }
    if (stadiumDef.name === 'Calamitous Wasteland' && pokemonDef.stage === 'Basic' && !pokemonDef.types.includes('Fighting')) {
      flatIncrease += 1;
    }
    if (stadiumDef.name === "N's Castle" && isNamedPokemon(pokemonDef, 'N')) {
      setToZero = true;
    }
    if (stadiumDef.name === 'Paradise Resort' && pokemonDef.name === 'Psyduck') {
      flatReduction += 1;
    }
  }

  // Passive ability modifiers
  // Skyliner (Latias ex): Basic Pokemon on the same side have no retreat cost.
  if (pokemonDef.stage === 'Basic') {
    const playerState = state.players[player];
    const allPlayerPokemon: InPlayPokemon[] = [];
    if (playerState.active) allPlayerPokemon.push(playerState.active);
    allPlayerPokemon.push(...playerState.bench);

    for (const candidate of allPlayerPokemon) {
      const candidateDef = getTopDef(state, candidate);
      if (!candidateDef) continue;
      const skylineAbility = candidateDef.abilities.find(a => a.name === 'Skyliner' && a.category === 'passive');
      if (!skylineAbility) continue;
      const isLocked = state.temporalEffects.some(
        e => e.type === 'ability_lock' &&
          (e.targetInstanceId === null || e.targetInstanceId === candidate.instanceId)
      );
      if (!isLocked) {
        setToZero = true;
        break;
      }
    }
  }

  return { flatReduction, flatIncrease, setToZero };
}

export function getEffectiveRetreatCost(
  state: GameState,
  player: PlayerId,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition
): number {
  const baseCost = pokemonDef.retreatCost;
  const mods = getRetreatCostModifiers(state, pokemon, pokemonDef, player);
  if (mods.setToZero) return 0;
  return Math.max(0, baseCost + mods.flatIncrease - mods.flatReduction);
}

// ─── Attack Cost Modifiers ───────────────────────────────────────────────

export function getAttackCostModifiers(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  player: PlayerId
): AttackCostModifierResult {
  let colorlessReduction = 0;
  let colorlessIncrease = 0;
  const jammingTower = isJammingTowerActive(state);

  // Tool modifiers (suppressed by Jamming Tower)
  if (!jammingTower) {
    const tools = getToolDefs(state, pokemon);
    const playerState = state.players[player];
    const opponentState = state.players[otherPlayer(player)];
    const morePrizes = playerState.prizes.length > opponentState.prizes.length;

    for (const { def: tool } of tools) {
      if (tool.name === 'Counter Gain' && morePrizes) {
        colorlessReduction += 1;
      }
      if (tool.name === 'Sparkling Crystal' && hasSubtype(pokemonDef, 'Tera')) {
        colorlessReduction += 1;
      }
      if (tool.name === "Hop's Choice Band" && isNamedPokemon(pokemonDef, 'Hop')) {
        colorlessReduction += 1;
      }
    }
  }

  // Stadium modifiers
  const stadiumDef = getStadiumDef(state);
  if (stadiumDef) {
    if (stadiumDef.name === 'Pokemon League Headquarters' && pokemonDef.stage === 'Basic') {
      colorlessIncrease += 1;
    }
    if (stadiumDef.name === 'Nighttime Mine' && hasSubtype(pokemonDef, 'Tera')) {
      colorlessIncrease += 1;
    }
  }

  // Passive ability modifiers
  // Seasoned Skill (Bloodmoon Ursaluna ex): this Pokemon's attacks cost [C] less
  // for each Prize card the opponent has taken (6 - opponent.prizes.length).
  const seasonedSkill = pokemonDef.abilities.find(a => a.name === 'Seasoned Skill' && a.category === 'passive');
  if (seasonedSkill) {
    const isLocked = state.temporalEffects.some(
      e => e.type === 'ability_lock' &&
        (e.targetInstanceId === null || e.targetInstanceId === pokemon.instanceId)
    );
    if (!isLocked) {
      const opponentPrizesRemaining = state.players[otherPlayer(player)].prizes.length;
      const opponentPrizesTaken = 6 - opponentPrizesRemaining;
      colorlessReduction += opponentPrizesTaken;
    }
  }

  return { colorlessReduction, colorlessIncrease };
}

export function getEffectiveAttackCost(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  attack: AttackDefinition,
  player: PlayerId
): ReadonlyArray<EnergyType> {
  const mods = getAttackCostModifiers(state, pokemon, pokemonDef, player);
  const baseCost = [...attack.cost];

  // Add Colorless costs (from stadiums like Pokemon League HQ)
  for (let i = 0; i < mods.colorlessIncrease; i++) {
    baseCost.push('Colorless');
  }

  // Remove Colorless costs first
  let toRemove = mods.colorlessReduction;
  for (let i = baseCost.length - 1; i >= 0 && toRemove > 0; i--) {
    if (baseCost[i] === 'Colorless') {
      baseCost.splice(i, 1);
      toRemove--;
    }
  }
  // If not enough Colorless, remove typed costs
  for (let i = baseCost.length - 1; i >= 0 && toRemove > 0; i--) {
    baseCost.splice(i, 1);
    toRemove--;
  }

  return baseCost;
}

// ─── HP Modifiers ────────────────────────────────────────────────────────

export function getHpModifiers(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  player: PlayerId
): HpModifierResult {
  let flatBonus = 0;
  const jammingTower = isJammingTowerActive(state);

  // Tool modifiers (suppressed by Jamming Tower)
  if (!jammingTower) {
    const tools = getToolDefs(state, pokemon);

    for (const { def: tool } of tools) {
      if (tool.name === "Hero's Cape") {
        flatBonus += 100;
      }
      if (tool.name === 'Bravery Charm' && pokemonDef.stage === 'Basic') {
        flatBonus += 50;
      }
      if (tool.name === "Cynthia's Power Weight" && isNamedPokemon(pokemonDef, 'Cynthia')) {
        flatBonus += 70;
      }
      if (tool.name === 'Luxurious Cape' && !hasRuleBox(pokemonDef)) {
        flatBonus += 100;
      }
      if (tool.name === 'Ancient Booster Energy Capsule' && hasSubtype(pokemonDef, 'Ancient')) {
        flatBonus += 60;
      }
    }
  }

  // Stadium modifiers
  const stadiumDef = getStadiumDef(state);
  if (stadiumDef) {
    if (stadiumDef.name === 'Lively Stadium' && pokemonDef.stage === 'Basic') {
      flatBonus += 30;
    }
    if (stadiumDef.name === 'Gravity Mountain' && pokemonDef.stage === 'Stage2') {
      flatBonus -= 30;
    }
  }

  return { flatBonus };
}

export function getEffectiveHp(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  player: PlayerId
): number {
  const baseHp = pokemonDef.hp;
  const mods = getHpModifiers(state, pokemon, pokemonDef, player);
  return baseHp + mods.flatBonus;
}

/** Standalone getEffectiveHp that resolves the def internally. Used by combat/checkup. */
export function getEffectiveHpById(state: GameState, pokemon: InPlayPokemon): number {
  const topId = pokemon.evolutionStack[pokemon.evolutionStack.length - 1] ?? pokemon.instanceId;
  const instance = state.cardRegistry.get(topId);
  if (!instance) return 0;
  const def = state.definitionRegistry.get(instance.definitionId);
  if (def?.cardType !== 'Pokemon') return 0;

  const owner = findPokemonOwner(state, pokemon.instanceId);
  if (!owner) return def.hp;

  return getEffectiveHp(state, pokemon, def, owner);
}

// ─── Prize Modifiers ─────────────────────────────────────────────────────

export function modifyPrizeCount(
  state: GameState,
  koedPokemon: InPlayPokemon,
  koedDef: PokemonCardDefinition,
  basePrizeValue: number,
  koedPlayer: PlayerId
): number {
  let adjustment = 0;
  const jammingTower = isJammingTowerActive(state);

  // Tool on the KO'd Pokemon
  if (!jammingTower) {
    const tools = getToolDefs(state, koedPokemon);
    for (const { def: tool } of tools) {
      if (tool.name === "Lillie's Pearl" && isNamedPokemon(koedDef, 'Lillie')) {
        adjustment -= 1;
      }
      if (tool.name === 'Luxurious Cape' && !hasRuleBox(koedDef)) {
        adjustment += 1;
      }
    }
  }

  return Math.max(1, basePrizeValue + adjustment);
}

// ─── Survival Effects ────────────────────────────────────────────────────

export function checkSurvivalEffects(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition,
  wasAtFullHpBeforeDamage: boolean,
  player: PlayerId
): SurvivalResult {
  const jammingTower = isJammingTowerActive(state);
  if (jammingTower) return { survived: false, newState: state };

  const tools = getToolDefs(state, pokemon);
  for (const { def: tool, instanceId: toolId } of tools) {
    if (tool.name === 'Survival Brace') {
      // Survival Brace: if at full HP before damage, survive with 10 HP
      if (wasAtFullHpBeforeDamage) {
        const effectiveHp = getEffectiveHp(state, pokemon, pokemonDef, player);
        const targetCounters = Math.floor((effectiveHp - 10) / 10);

        let s = updatePokemonInPlay(state, pokemon.instanceId, p => ({
          ...p,
          damageCounters: targetCounters
        }));
        s = discardTool(s, pokemon.instanceId, toolId);
        s = addEvents(s, [
          { type: 'DAMAGE_COUNTERS_PLACED', targetInstanceId: pokemon.instanceId, counters: targetCounters, source: 'Survival Brace' } as GameEvent
        ]);
        return { survived: true, newState: s };
      }
    }
  }

  return { survived: false, newState: state };
}

// ─── On-Damage Triggers ──────────────────────────────────────────────────

export function resolveOnDamageTriggers(
  state: GameState,
  targetInstanceId: string,
  attackerInstanceId: string,
  damageDealt: number
): GameState {
  // Only fire if target is in the Active Spot
  let targetPlayer: PlayerId | null = null;
  for (const [pid, ps] of Object.entries(state.players) as Array<[PlayerId, PlayerState]>) {
    if (ps.active?.instanceId === targetInstanceId) {
      targetPlayer = pid;
      break;
    }
  }
  if (!targetPlayer) return state;

  const target = state.players[targetPlayer].active!;
  const targetDef = getTopDef(state, target);
  if (!targetDef) return state;

  const jammingTower = isJammingTowerActive(state);
  if (jammingTower) return state;

  let s = state;
  const tools = getToolDefs(s, target);

  for (const { def: tool, instanceId: toolId } of tools) {
    if (tool.name === 'Rocky Helmet') {
      s = placeDamageCountersOnPokemon(s, attackerInstanceId, 2, 'Rocky Helmet');
    }
    if (tool.name === 'Punk Helmet' && targetDef.types.includes('Darkness')) {
      s = placeDamageCountersOnPokemon(s, attackerInstanceId, 4, 'Punk Helmet');
    }
    if (tool.name === 'Deluxe Bomb') {
      s = placeDamageCountersOnPokemon(s, attackerInstanceId, 12, 'Deluxe Bomb');
      s = discardTool(s, targetInstanceId, toolId);
    }
    if (tool.name === 'Lucky Helmet') {
      s = drawCardsForPlayer(s, targetPlayer, 2);
    }
    if (tool.name === 'Handheld Fan') {
      s = resolveHandheldFan(s, attackerInstanceId);
    }
    if (tool.name === "Team Rocket's Hypnotizer" && isNamedPokemon(targetDef, 'Team Rocket')) {
      s = applyConditionToTarget(s, attackerInstanceId, 'Asleep');
    }
  }

  return s;
}

function placeDamageCountersOnPokemon(
  state: GameState,
  targetInstanceId: string,
  counters: number,
  source: string
): GameState {
  const s = updatePokemonInPlay(state, targetInstanceId, p => ({
    ...p,
    damageCounters: p.damageCounters + counters
  }));
  return addEvents(s, [
    { type: 'DAMAGE_COUNTERS_PLACED', targetInstanceId, counters, source } as GameEvent
  ]);
}

function drawCardsForPlayer(state: GameState, player: PlayerId, count: number): GameState {
  const ps = state.players[player];
  const toDraw = Math.min(count, ps.deck.length);
  const drawn = ps.deck.slice(0, toDraw);
  const events: GameEvent[] = drawn.map(id => ({
    type: 'CARD_DRAWN' as const,
    player,
    cardInstanceId: id
  }));
  return addEvents(
    {
      ...state,
      players: {
        ...state.players,
        [player]: {
          ...ps,
          deck: ps.deck.slice(toDraw),
          hand: [...ps.hand, ...drawn]
        }
      }
    },
    events
  );
}

function resolveHandheldFan(state: GameState, attackerInstanceId: string): GameState {
  const attackerOwner = findPokemonOwner(state, attackerInstanceId);
  if (!attackerOwner) return state;

  const attackerPs = state.players[attackerOwner];
  const attacker = attackerPs.active?.instanceId === attackerInstanceId
    ? attackerPs.active
    : attackerPs.bench.find(b => b.instanceId === attackerInstanceId);
  if (!attacker || attacker.attachedEnergy.length === 0) return state;

  const opponent = otherPlayer(attackerOwner);
  const opponentPs = state.players[opponent];
  if (opponentPs.bench.length === 0) return state;

  // Move first energy from attacker to first bench Pokemon of opponent
  const energyId = attacker.attachedEnergy[0]!;
  const benchTarget = opponentPs.bench[0]!;

  let s = updatePokemonInPlay(state, attackerInstanceId, p => ({
    ...p,
    attachedEnergy: p.attachedEnergy.filter(e => e !== energyId)
  }));
  s = updatePokemonInPlay(s, benchTarget.instanceId, p => ({
    ...p,
    attachedEnergy: [...p.attachedEnergy, energyId]
  }));

  return s;
}

function applyConditionToTarget(
  state: GameState,
  targetInstanceId: string,
  condition: 'Asleep' | 'Burned' | 'Confused' | 'Paralyzed' | 'Poisoned'
): GameState {
  return updatePokemonInPlay(state, targetInstanceId, p => {
    // Asleep, Confused, Paralyzed are mutually exclusive
    const rotational: ReadonlyArray<string> = ['Asleep', 'Confused', 'Paralyzed'];
    if (rotational.includes(condition)) {
      const filtered = p.specialConditions.filter(c => !rotational.includes(c));
      return { ...p, specialConditions: [...filtered, condition] };
    }
    if (p.specialConditions.includes(condition)) return p;
    return { ...p, specialConditions: [...p.specialConditions, condition] };
  });
}

// ─── On-KO Triggers ──────────────────────────────────────────────────────

export function resolveOnKOTriggers(
  state: GameState,
  koedPokemon: InPlayPokemon,
  koedDef: PokemonCardDefinition,
  koedPlayer: PlayerId,
  attackerInstanceId: string | null
): GameState {
  const jammingTower = isJammingTowerActive(state);
  if (jammingTower) return state;

  let s = state;
  const opponent = otherPlayer(koedPlayer);

  // Check ALL benched Pokemon of the KO'd player for Exp. Share
  const koedPlayerState = s.players[koedPlayer];
  for (const benched of koedPlayerState.bench) {
    const benchTools = getToolDefs(s, benched);
    for (const { def: tool } of benchTools) {
      if (tool.name === 'Exp. Share') {
        // Move 1 Basic Energy from the KO'd Pokemon to this benched Pokemon
        const basicEnergy = koedPokemon.attachedEnergy.find(eid => {
          const inst = s.cardRegistry.get(eid);
          if (!inst) return false;
          const def = s.definitionRegistry.get(inst.definitionId);
          return def?.cardType === 'Energy' && def.subtype === 'Basic';
        });

        if (basicEnergy) {
          // Remove from KO'd Pokemon, add to benched
          s = updatePokemonInPlay(s, koedPokemon.instanceId, p => ({
            ...p,
            attachedEnergy: p.attachedEnergy.filter(e => e !== basicEnergy)
          }));
          s = updatePokemonInPlay(s, benched.instanceId, p => ({
            ...p,
            attachedEnergy: [...p.attachedEnergy, basicEnergy]
          }));
          break; // Only one Exp. Share triggers per KO
        }
      }
    }
  }

  // Check tools on the KO'd Pokemon itself
  const koedTools = getToolDefs(s, koedPokemon);
  for (const { def: tool } of koedTools) {
    if (tool.name === 'Amulet of Hope') {
      // Search deck for up to 3 cards — simplified: draw 3
      s = drawCardsForPlayer(s, koedPlayer, 3);
    }
    if (tool.name === 'Cursed Duster') {
      const opponentPs = s.players[opponent];
      if (opponentPs.hand.length > 0) {
        // Discard random card — use first card as deterministic stand-in
        const cardToDiscard = opponentPs.hand[0]!;
        s = {
          ...s,
          players: {
            ...s.players,
            [opponent]: {
              ...opponentPs,
              hand: opponentPs.hand.filter(c => c !== cardToDiscard),
              discard: [...opponentPs.discard, cardToDiscard]
            }
          },
          eventLog: [...s.eventLog, { type: 'CARD_DISCARDED', player: opponent, cardInstanceId: cardToDiscard } as GameEvent]
        };
      }
    }
    if (tool.name === 'Heavy Baton') {
      // If KO'd Pokemon had retreat cost >= 4, move up to 3 Basic Energy to bench
      if (koedDef.retreatCost >= 4) {
        const benchPokemon = s.players[koedPlayer].bench;
        if (benchPokemon.length > 0) {
          // Get the KO'd Pokemon's current energy state
          const currentKoed = findInPlay(s, koedPokemon.instanceId);
          if (currentKoed) {
            const basicEnergyIds = currentKoed.attachedEnergy.filter(eid => {
              const inst = s.cardRegistry.get(eid);
              if (!inst) return false;
              const def = s.definitionRegistry.get(inst.definitionId);
              return def?.cardType === 'Energy' && def.subtype === 'Basic';
            });
            const toMove = basicEnergyIds.slice(0, 3);
            const target = benchPokemon[0]!;
            for (const energyId of toMove) {
              s = updatePokemonInPlay(s, koedPokemon.instanceId, p => ({
                ...p,
                attachedEnergy: p.attachedEnergy.filter(e => e !== energyId)
              }));
              s = updatePokemonInPlay(s, target.instanceId, p => ({
                ...p,
                attachedEnergy: [...p.attachedEnergy, energyId]
              }));
            }
          }
        }
      }
    }
  }

  // Vengeful Punch — not registered in tools.ts, skip

  return s;
}

function findInPlay(state: GameState, instanceId: string): InPlayPokemon | null {
  for (const ps of Object.values(state.players)) {
    if (ps.active?.instanceId === instanceId) return ps.active;
    const b = ps.bench.find(p => p.instanceId === instanceId);
    if (b) return b;
  }
  return null;
}

// ─── Checkup Modifiers ───────────────────────────────────────────────────

export function getPoisonModifiers(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition
): number {
  let extraCounters = 0;

  const stadiumDef = getStadiumDef(state);
  if (stadiumDef) {
    if (stadiumDef.name === 'Perilous Jungle' && !pokemonDef.types.includes('Darkness')) {
      extraCounters += 2;
    }
  }

  return extraCounters;
}

export function checkConditionImmunity(
  state: GameState,
  pokemon: InPlayPokemon,
  pokemonDef: PokemonCardDefinition
): boolean {
  // Festival Grounds: immune to Special Conditions if Energy attached
  const stadiumDef = getStadiumDef(state);
  if (stadiumDef && stadiumDef.name === 'Festival Grounds' && pokemon.attachedEnergy.length > 0) {
    return true;
  }

  // Ancient Booster Energy Capsule: immune to Special Conditions (if Ancient)
  if (!isJammingTowerActive(state)) {
    const tools = getToolDefs(state, pokemon);
    for (const { def: tool } of tools) {
      if (tool.name === 'Ancient Booster Energy Capsule' && hasSubtype(pokemonDef, 'Ancient')) {
        return true;
      }
    }
  }

  return false;
}

/** Check if Neutralization Zone prevents damage from ex to non-Rule-Box */
export function isNeutralizationZoneActive(
  state: GameState,
  attackerDef: PokemonCardDefinition,
  defenderDef: PokemonCardDefinition
): boolean {
  const stadiumDef = getStadiumDef(state);
  if (!stadiumDef) return false;
  return stadiumDef.name === 'Neutralization Zone' && hasRuleBox(attackerDef) && !hasRuleBox(defenderDef);
}
