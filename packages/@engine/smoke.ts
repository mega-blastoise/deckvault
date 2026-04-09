import { loadStandardCardPool } from './lib/adapter';
import { analyzeOpeningHands } from './lib/simulation/opening';
import {
  runSimulation,
  runMatchupMatrix,
  serializeResultSummary
} from './lib/simulation/runner';
import type { CardDefinition, PokemonCardDefinition, TrainerCardDefinition, EnergyCardDefinition } from './lib/types/card';
import type { DeckInput } from './lib/simulation/runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterCards<T extends CardDefinition>(
  defs: ReadonlyMap<string, CardDefinition>,
  predicate: (c: CardDefinition) => c is T
): T[] {
  const results: T[] = [];
  for (const c of defs.values()) {
    if (predicate(c)) results.push(c);
  }
  return results;
}

function isPokemon(c: CardDefinition): c is PokemonCardDefinition {
  return c.cardType === 'Pokemon';
}

function isTrainer(c: CardDefinition): c is TrainerCardDefinition {
  return c.cardType === 'Trainer';
}

function isEnergy(c: CardDefinition): c is EnergyCardDefinition {
  return c.cardType === 'Energy';
}

// Deduplicate by name — keep the first occurrence (arbitrary but stable).
function uniqueByName<T extends { name: string }>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Deck builder
// ---------------------------------------------------------------------------

interface DeckBuildResult {
  readonly deck: DeckInput;
  readonly summary: string;
}

function buildDeck(
  name: string,
  defs: ReadonlyMap<string, CardDefinition>,
  preferredTypes: ReadonlyArray<string>
): DeckBuildResult {
  const allPokemon = filterCards(defs, isPokemon);
  const allTrainers = filterCards(defs, isTrainer);
  const allEnergy = filterCards(defs, isEnergy);

  // --- Pokemon selection (target 14) ---
  // Find Stage 1s that evolve from a Basic we also have
  const basicsByName = new Map<string, PokemonCardDefinition>();
  for (const p of allPokemon) {
    if (p.stage === 'Basic') basicsByName.set(p.name, p);
  }

  // Prefer Pokemon whose type overlaps with preferredTypes
  const typeMatch = (p: PokemonCardDefinition) =>
    p.types.some(t => preferredTypes.includes(t));

  const stage1s = uniqueByName(
    allPokemon
      .filter(p => p.stage === 'Stage1' && p.evolvesFrom && basicsByName.has(p.evolvesFrom))
      .filter(typeMatch)
  );

  // Pick up to 4 evolution lines (2 copies each of basic + stage1 = 16 slots max)
  const pokemonEntries: Array<{ cardId: string; count: number; label: string }> = [];
  const usedBasicNames = new Set<string>();
  let pokemonCount = 0;
  const MAX_POKEMON = 14;

  for (const s1 of stage1s) {
    if (pokemonCount >= MAX_POKEMON) break;
    const basicName = s1.evolvesFrom!;
    if (usedBasicNames.has(basicName)) continue;
    const basic = basicsByName.get(basicName);
    if (!basic) continue;

    usedBasicNames.add(basicName);
    const copies = 2;
    pokemonEntries.push({ cardId: basic.id, count: copies, label: `${basic.name} (Basic)` });
    pokemonEntries.push({ cardId: s1.id, count: copies, label: `${s1.name} (Stage1)` });
    pokemonCount += copies * 2;
  }

  // Fill remaining Pokemon slots with type-matching Basics
  const fillerBasics = uniqueByName(
    allPokemon
      .filter(p => p.stage === 'Basic' && typeMatch(p) && !usedBasicNames.has(p.name))
      .sort((a, b) => b.hp - a.hp)
  );

  for (const b of fillerBasics) {
    if (pokemonCount >= MAX_POKEMON) break;
    const copies = Math.min(2, MAX_POKEMON - pokemonCount);
    pokemonEntries.push({ cardId: b.id, count: copies, label: `${b.name} (Basic filler)` });
    pokemonCount += copies;
  }

  if (pokemonCount < 4) {
    console.error(`[${name}] Only found ${pokemonCount} Pokemon — need at least 4. Aborting.`);
    process.exit(1);
  }

  // --- Trainer selection (target 12) ---
  const supporters = uniqueByName(allTrainers.filter(t => t.subtypes.includes('Supporter')));
  const items = uniqueByName(allTrainers.filter(t => t.subtypes.includes('Item')));

  const trainerEntries: Array<{ cardId: string; count: number; label: string }> = [];
  let trainerCount = 0;
  const MAX_TRAINERS = 12;

  // 3 unique supporters x 2 copies = 6
  for (const s of supporters.slice(0, 3)) {
    if (trainerCount >= MAX_TRAINERS) break;
    const copies = 2;
    trainerEntries.push({ cardId: s.id, count: copies, label: `${s.name} (Supporter)` });
    trainerCount += copies;
  }

  // Fill rest with items
  for (const item of items) {
    if (trainerCount >= MAX_TRAINERS) break;
    const copies = Math.min(2, MAX_TRAINERS - trainerCount);
    trainerEntries.push({ cardId: item.id, count: copies, label: `${item.name} (Item)` });
    trainerCount += copies;
  }

  // --- Energy (fill to 60) ---
  const remaining = 60 - pokemonCount - trainerCount;
  const basicEnergy = uniqueByName(allEnergy.filter(e => e.subtype === 'Basic'));

  // Prefer energy types that match the Pokemon types
  const matchingEnergy = basicEnergy.filter(e =>
    e.provides.some(p => preferredTypes.includes(p))
  );
  const fallbackEnergy = basicEnergy.filter(e =>
    !e.provides.some(p => preferredTypes.includes(p))
  );

  const energyEntries: Array<{ cardId: string; count: number; label: string }> = [];
  let energyCount = 0;

  // Split matching energy evenly, up to 4 copies each
  if (matchingEnergy.length > 0) {
    const perType = Math.min(4, Math.ceil(remaining / matchingEnergy.length));
    for (const e of matchingEnergy) {
      if (energyCount >= remaining) break;
      const copies = Math.min(perType, remaining - energyCount);
      energyEntries.push({ cardId: e.id, count: copies, label: `${e.name}` });
      energyCount += copies;
    }
  }

  // Fill remainder with fallback energy (Colorless or whatever is available)
  if (energyCount < remaining && fallbackEnergy.length > 0) {
    const copies = remaining - energyCount;
    energyEntries.push({ cardId: fallbackEnergy[0]!.id, count: copies, label: `${fallbackEnergy[0]!.name} (filler)` });
    energyCount += copies;
  } else if (energyCount < remaining && matchingEnergy.length > 0) {
    // Just add more of the first matching energy
    const extra = remaining - energyCount;
    energyEntries[0]!.count += extra;
    energyCount += extra;
  }

  const totalCards = pokemonCount + trainerCount + energyCount;
  if (totalCards !== 60) {
    console.error(`[${name}] Deck has ${totalCards} cards instead of 60. Aborting.`);
    process.exit(1);
  }

  const allEntries = [...pokemonEntries, ...trainerEntries, ...energyEntries];
  const cards = allEntries.map(e => ({ cardId: e.cardId, count: e.count }));
  const summary = allEntries.map(e => `  ${e.count}x ${e.label}`).join('\n');

  return {
    deck: { name, cards },
    summary
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DB_PATH = './database/pokemon-data.sqlite3.db';
const FORMAT_DATE = new Date();

console.log('=== SPEC_07 Smoke Test ===\n');
console.log(`Format date: ${FORMAT_DATE.toISOString().slice(0, 10)}`);
console.log(`DB path:     ${DB_PATH}\n`);

// 1. Load card pool
console.log('--- Loading Standard Card Pool ---');
const definitions = loadStandardCardPool(DB_PATH, FORMAT_DATE);
console.log(`Loaded ${definitions.size} card definitions\n`);

// Quick census
let pokemonCount = 0;
let trainerCount = 0;
let energyCount = 0;
for (const c of definitions.values()) {
  if (c.cardType === 'Pokemon') pokemonCount++;
  else if (c.cardType === 'Trainer') trainerCount++;
  else if (c.cardType === 'Energy') energyCount++;
}
console.log(`  Pokemon:  ${pokemonCount}`);
console.log(`  Trainers: ${trainerCount}`);
console.log(`  Energy:   ${energyCount}\n`);

// 2. Build two decks
console.log('--- Building Decks ---\n');

const deck1Result = buildDeck('Fire/Fighting Aggro', definitions, ['Fire', 'Fighting']);
console.log(`Deck 1: ${deck1Result.deck.name}`);
console.log(deck1Result.summary);
console.log();

const deck2Result = buildDeck('Water/Psychic Control', definitions, ['Water', 'Psychic']);
console.log(`Deck 2: ${deck2Result.deck.name}`);
console.log(deck2Result.summary);
console.log();

// 3. Opening hand analysis
console.log('--- Opening Hand Analysis (1000 samples each) ---\n');

const deck1Opening = analyzeOpeningHands(deck1Result.deck, definitions, 1000, 42);
console.log(`${deck1Result.deck.name}:`);
console.log(`  Mulligan rate:           ${(deck1Opening.mulliganRate * 100).toFixed(1)}%`);
console.log(`  Avg mulligans:           ${deck1Opening.averageMulligans.toFixed(2)}`);
console.log(`  Avg basics in opener:    ${deck1Opening.averageBasicsInOpeningHand.toFixed(2)}`);
console.log(`  Supporter T1 rate:       ${(deck1Opening.hasSupporterTurn1Rate * 100).toFixed(1)}%`);
console.log(`  Energy T1 rate:          ${(deck1Opening.hasEnergyTurn1Rate * 100).toFixed(1)}%`);
console.log(`  Evolution pair rate:     ${(deck1Opening.hasEvolutionTargetRate * 100).toFixed(1)}%`);
console.log(`  Ideal opening rate:      ${(deck1Opening.idealOpeningRate * 100).toFixed(1)}%`);
console.log();

const deck2Opening = analyzeOpeningHands(deck2Result.deck, definitions, 1000, 99);
console.log(`${deck2Result.deck.name}:`);
console.log(`  Mulligan rate:           ${(deck2Opening.mulliganRate * 100).toFixed(1)}%`);
console.log(`  Avg mulligans:           ${deck2Opening.averageMulligans.toFixed(2)}`);
console.log(`  Avg basics in opener:    ${deck2Opening.averageBasicsInOpeningHand.toFixed(2)}`);
console.log(`  Supporter T1 rate:       ${(deck2Opening.hasSupporterTurn1Rate * 100).toFixed(1)}%`);
console.log(`  Energy T1 rate:          ${(deck2Opening.hasEnergyTurn1Rate * 100).toFixed(1)}%`);
console.log(`  Evolution pair rate:     ${(deck2Opening.hasEvolutionTargetRate * 100).toFixed(1)}%`);
console.log(`  Ideal opening rate:      ${(deck2Opening.idealOpeningRate * 100).toFixed(1)}%`);
console.log();

// 4. Run simulation
console.log('--- Simulation (10 games) ---\n');

const simResult = runSimulation({
  deck1: deck1Result.deck,
  deck2: deck2Result.deck,
  games: 10,
  maxTurnsPerGame: 200,
  seed: 12345,
  formatDate: FORMAT_DATE,
  dbPath: DB_PATH
});

const summary = serializeResultSummary(simResult);
console.log('Simulation Summary:');
console.log(JSON.stringify(summary, null, 2));
console.log();

console.log('Win/Loss/Draw:');
console.log(`  ${deck1Result.deck.name}: ${simResult.deck1Wins} wins`);
console.log(`  ${deck2Result.deck.name}: ${simResult.deck2Wins} wins`);
console.log(`  Draws: ${simResult.draws}`);
console.log();

console.log(`Average turn count: ${simResult.averageTurnCount.toFixed(1)}`);
console.log(`Median turn count:  ${simResult.medianTurnCount}`);
console.log(`Avg game duration:  ${simResult.averageGameDurationMs.toFixed(1)}ms`);
console.log();

console.log('Consistency Scores:');
console.log(`  ${deck1Result.deck.name}: ${simResult.deck1Stats.consistencyScore.toFixed(3)}`);
console.log(`  ${deck2Result.deck.name}: ${simResult.deck2Stats.consistencyScore.toFixed(3)}`);
console.log();

// 5. Matchup matrix
console.log('--- Matchup Matrix (5 games) ---\n');

const matchupResult = runMatchupMatrix({
  testDeck: deck1Result.deck,
  opponents: [deck2Result.deck],
  gamesPerMatchup: 5,
  seed: 77777
});

console.log(`Test deck: ${matchupResult.testDeck}`);
console.log(`Overall win rate: ${(matchupResult.overallWinRate * 100).toFixed(1)}%`);
for (const m of matchupResult.matchups) {
  console.log(`  vs ${m.opponent}: ${(m.winRate * 100).toFixed(1)}% (${m.gamesPlayed} games) — ${m.favorability}`);
}
console.log();

console.log('=== Smoke test complete ===');
