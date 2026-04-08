import type { CardDefinition } from '@pokemon/engine';
import type { CapturedReplay, SerializedSimulationResult } from '../../../workers/simulation.worker';
import type {
  WinConditionData,
  PrizeRaceData,
  PrizeRacePoint,
  OpeningHandData,
  HandArchetype,
  KeyCardCurve,
  KeyCardCurvePoint,
  TrainerUtilizationEntry,
  TurnLengthBucket,
  Perspective
} from './types';
import type { ResolvedDeck } from '../DeckInputPanel/types';

type GameResult = SerializedSimulationResult['gameResults'][number];

// Extract the definition ID from an instance ID produced by the engine.
// Engine format: `p1-${defId}-${count}` or `p2-${defId}-${count}`
export function defIdFromInstanceId(instanceId: string): string {
  const withoutPrefix = instanceId.startsWith('p1-') || instanceId.startsWith('p2-')
    ? instanceId.slice(3)
    : instanceId;
  const lastDash = withoutPrefix.lastIndexOf('-');
  if (lastDash === -1) return withoutPrefix;
  const suffix = withoutPrefix.slice(lastDash + 1);
  // Only strip if suffix is numeric (the count)
  if (/^\d+$/.test(suffix)) {
    return withoutPrefix.slice(0, lastDash);
  }
  return withoutPrefix;
}

function playerPrefix(perspective: Perspective): 'p1' | 'p2' {
  return perspective === 'player1' ? 'p1' : 'p2';
}

// ─── Win Condition Breakdown ─────────────────────────────────────────────────

export function transformWinConditions(
  result: SerializedSimulationResult,
  perspective: Perspective
): WinConditionData {
  const total = result.gamesPlayed;
  if (total === 0) {
    return { total: 0, segments: [] };
  }

  const myWins = perspective === 'player1' ? result.deck1Wins : result.deck2Wins;
  const oppWins = perspective === 'player1' ? result.deck2Wins : result.deck1Wins;
  const draws = result.draws;

  // Break wins down by win reason using gameResults
  const myWinResults = result.gameResults.filter(
    (r) => r.winner === (perspective === 'player1' ? 'player1' : 'player2')
  );
  const oppWinResults = result.gameResults.filter(
    (r) => r.winner === (perspective === 'player1' ? 'player2' : 'player1')
  );

  const myPrizeWins = myWinResults.filter((r) => r.winReason === 'all_prizes_taken').length;
  const myDeckOutWins = myWinResults.filter((r) => r.winReason === 'deck_out').length;
  const myNoPokemonWins = myWinResults.filter((r) => r.winReason === 'no_pokemon_in_play').length;
  const myOtherWins = myWins - myPrizeWins - myDeckOutWins - myNoPokemonWins;

  const oppPrizeWins = oppWinResults.filter((r) => r.winReason === 'all_prizes_taken').length;
  const oppDeckOutWins = oppWinResults.filter((r) => r.winReason === 'deck_out').length;
  const oppNoPokemonWins = oppWinResults.filter((r) => r.winReason === 'no_pokemon_in_play').length;
  const oppOtherWins = oppWins - oppPrizeWins - oppDeckOutWins - oppNoPokemonWins;

  const segments = [
    { label: 'Prizes (You)', count: myPrizeWins, color: '#22c55e' },
    { label: 'Deck-out (You)', count: myDeckOutWins, color: '#16a34a' },
    { label: 'No Pokémon (You)', count: myNoPokemonWins, color: '#15803d' },
    ...(myOtherWins > 0 ? [{ label: 'Other (You)', count: myOtherWins, color: '#14532d' }] : []),
    { label: 'Prizes (Opp)', count: oppPrizeWins, color: '#ef4444' },
    { label: 'Deck-out (Opp)', count: oppDeckOutWins, color: '#dc2626' },
    { label: 'No Pokémon (Opp)', count: oppNoPokemonWins, color: '#b91c1c' },
    ...(oppOtherWins > 0 ? [{ label: 'Other (Opp)', count: oppOtherWins, color: '#7f1d1d' }] : []),
    { label: 'Draw', count: draws, color: '#6b7280' }
  ]
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, percent: s.count / total }));

  return { total, segments };
}

// ─── Prize Race Timeline ──────────────────────────────────────────────────────

export function transformPrizeRace(
  replays: ReadonlyArray<CapturedReplay>,
  perspective: Perspective
): PrizeRaceData {
  if (replays.length === 0) {
    return { points: [], maxTurn: 0 };
  }

  const myPlayer = perspective === 'player1' ? 'player1' : 'player2';
  const oppPlayer = perspective === 'player1' ? 'player2' : 'player1';

  // For each replay, build turn-by-turn prize differential (myPrizesTaken - oppPrizesTaken)
  // Prize differential: positive = I'm ahead (took more prizes)
  type TurnMap = Map<number, number>;

  const gameCurves: TurnMap[] = replays.map((replay) => {
    const curve: TurnMap = new Map();
    let myPrizes = 0;
    let oppPrizes = 0;
    let currentTurn = 0;

    for (const event of replay.eventLog) {
      if (event.type === 'TURN_STARTED') {
        currentTurn = event.turnNumber;
      } else if (event.type === 'PRIZE_TAKEN') {
        if (event.player === myPlayer) myPrizes++;
        else if (event.player === oppPlayer) oppPrizes++;
        curve.set(currentTurn, myPrizes - oppPrizes);
      }
    }
    // Ensure turn 0 exists
    if (!curve.has(0)) curve.set(0, 0);
    return curve;
  });

  const maxTurn = Math.max(
    ...gameCurves.map((c) => Math.max(0, ...c.keys()))
  );

  const points: PrizeRacePoint[] = [];
  for (let t = 0; t <= maxTurn; t++) {
    const values: number[] = gameCurves.map((curve) => {
      // Carry forward the last known value for this game
      let last = 0;
      for (let i = 0; i <= t; i++) {
        if (curve.has(i)) last = curve.get(i)!;
      }
      return last;
    });

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    points.push({ turn: t, meanDifferential: mean, stdDev });
  }

  return { points, maxTurn };
}

// ─── Opening Hand Quality ─────────────────────────────────────────────────────

function classifyHand(
  instanceIds: ReadonlyArray<string>,
  definitions: Record<string, CardDefinition>
): string {
  let basics = 0;
  let supporters = 0;
  let items = 0;
  let energy = 0;
  let other = 0;

  for (const instanceId of instanceIds) {
    const defId = defIdFromInstanceId(instanceId);
    const def = definitions[defId];
    if (!def) { other++; continue; }

    if (def.cardType === 'Pokemon' && def.stage === 'Basic') basics++;
    else if (def.cardType === 'Trainer' && def.subtypes.includes('Supporter')) supporters++;
    else if (def.cardType === 'Trainer') items++;
    else if (def.cardType === 'Energy') energy++;
    else other++;
  }

  const parts: string[] = [];
  if (basics > 0) parts.push(`${basics}B`);
  if (supporters > 0) parts.push(`${supporters}S`);
  if (items > 0) parts.push(`${items}I`);
  if (energy > 0) parts.push(`${energy}E`);
  if (other > 0) parts.push(`${other}O`);
  return parts.join('-') || 'Empty';
}

export function transformOpeningHand(
  replays: ReadonlyArray<CapturedReplay>,
  definitions: Record<string, CardDefinition>,
  perspective: Perspective
): OpeningHandData {
  if (replays.length === 0) {
    return {
      mulliganRate: 0,
      hasSupporterRate: 0,
      hasEnergyRate: 0,
      idealOpeningRate: 0,
      averageBasicsInHand: 0,
      handArchetypes: []
    };
  }

  const myPlayer = perspective === 'player1' ? 'player1' : 'player2';
  const prefix = playerPrefix(perspective);

  let mulliganCount = 0;
  let supporterCount = 0;
  let energyCount = 0;
  let idealCount = 0;
  let totalBasics = 0;
  const archetypeMap = new Map<string, number>();

  for (const replay of replays) {
    // Check for mulligan
    const hasMulligan = replay.eventLog.some(
      (e) => e.type === 'MULLIGAN' && e.player === myPlayer
    );
    if (hasMulligan) mulliganCount++;

    // Collect the first 7 CARD_DRAWN events for this player before TURN_STARTED turn 1
    const openingHand: string[] = [];
    let turnStarted = false;
    for (const event of replay.eventLog) {
      if (event.type === 'TURN_STARTED' && event.turnNumber === 1) {
        turnStarted = true;
        break;
      }
      if (
        event.type === 'CARD_DRAWN' &&
        event.player === myPlayer &&
        event.cardInstanceId.startsWith(`${prefix}-`)
      ) {
        openingHand.push(event.cardInstanceId);
      }
    }
    if (turnStarted && openingHand.length === 0) continue;

    // Analyse composition
    let hasBasic = false;
    let hasSupporter = false;
    let hasEnergy = false;
    let basicCount = 0;

    for (const instanceId of openingHand) {
      const defId = defIdFromInstanceId(instanceId);
      const def = definitions[defId];
      if (!def) continue;

      if (def.cardType === 'Pokemon' && def.stage === 'Basic') {
        hasBasic = true;
        basicCount++;
      } else if (def.cardType === 'Trainer' && def.subtypes.includes('Supporter')) {
        hasSupporter = true;
      } else if (def.cardType === 'Energy') {
        hasEnergy = true;
      }
    }

    if (hasSupporter) supporterCount++;
    if (hasEnergy) energyCount++;
    totalBasics += basicCount;

    const isIdeal = hasBasic && (hasSupporter || hasEnergy);
    if (isIdeal) idealCount++;

    const archetype = classifyHand(openingHand, definitions);
    archetypeMap.set(archetype, (archetypeMap.get(archetype) ?? 0) + 1);
  }

  const total = replays.length;

  const sortedArchetypes = [...archetypeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]): HandArchetype => ({
      label,
      frequency: count / total,
      isIdeal: true // simplified: any hand with basics + supporter/energy
    }));

  return {
    mulliganRate: mulliganCount / total,
    hasSupporterRate: supporterCount / total,
    hasEnergyRate: energyCount / total,
    idealOpeningRate: idealCount / total,
    averageBasicsInHand: totalBasics / total,
    handArchetypes: sortedArchetypes
  };
}

// ─── Key Card Curves ──────────────────────────────────────────────────────────

export function transformKeyCardCurves(
  replays: ReadonlyArray<CapturedReplay>,
  keyCardIds: ReadonlyArray<string>,
  definitions: Record<string, CardDefinition>,
  perspective: Perspective,
  deck: ResolvedDeck
): ReadonlyArray<KeyCardCurve> {
  if (replays.length === 0 || keyCardIds.length === 0) return [];

  const myPlayer = perspective === 'player1' ? 'player1' : 'player2';
  const maxTurn = 10;

  return keyCardIds.map((cardId): KeyCardCurve => {
    const def = definitions[cardId];
    const cardName = def?.name ?? cardId;
    const copiesInDeck = deck.cards
      .filter((c) => c.cardId === cardId)
      .reduce((s, c) => s + c.count, 0);

    // For each replay: what's the earliest turn we see this card?
    const firstSeenByTurn: number[] = replays.map((replay) => {
      let currentTurn = 0;
      for (const event of replay.eventLog) {
        if (event.type === 'TURN_STARTED') {
          currentTurn = event.turnNumber;
        }
        if (
          (event.type === 'CARD_DRAWN' || event.type === 'CARD_SEARCHED') &&
          event.player === myPlayer
        ) {
          const defId = defIdFromInstanceId(event.cardInstanceId);
          if (defId === cardId) {
            return currentTurn;
          }
        }
      }
      return Infinity; // Never seen
    });

    const totalGames = replays.length;
    const curve: KeyCardCurvePoint[] = [];

    for (let t = 1; t <= maxTurn; t++) {
      const gamesSeenByT = firstSeenByTurn.filter((turn) => turn <= t).length;
      curve.push({ turn: t, probability: gamesSeenByT / totalGames });
    }

    return { cardId, cardName, copiesInDeck, curve };
  });
}

// ─── Trainer Utilization ──────────────────────────────────────────────────────

export function transformTrainerUtilization(
  replays: ReadonlyArray<CapturedReplay>,
  deck: ResolvedDeck,
  definitions: Record<string, CardDefinition>,
  perspective: Perspective
): ReadonlyArray<TrainerUtilizationEntry> {
  if (replays.length === 0) return [];

  const myPlayer = perspective === 'player1' ? 'player1' : 'player2';

  // Find trainer cards in the deck
  const trainerCards = deck.cards.filter(({ cardId }) => {
    const def = definitions[cardId];
    return def?.cardType === 'Trainer';
  });

  if (trainerCards.length === 0) return [];

  return trainerCards
    .map(({ cardId, count: copiesInDeck }): TrainerUtilizationEntry => {
      const def = definitions[cardId];
      const cardName = def?.name ?? cardId;

      let totalCopiesPlayed = 0;
      let gamesPlayed = 0;
      let totalFirstPlayTurn = 0;
      let gamesWithFirstPlay = 0;

      for (const replay of replays) {
        let copiesThisGame = 0;
        let firstTurnThisGame: number | null = null;
        let currentTurn = 0;

        for (const event of replay.eventLog) {
          if (event.type === 'TURN_STARTED') {
            currentTurn = event.turnNumber;
          }
          if (
            event.type === 'TRAINER_PLAYED' &&
            event.player === myPlayer
          ) {
            const defId = defIdFromInstanceId(event.cardInstanceId);
            if (defId === cardId) {
              copiesThisGame++;
              if (firstTurnThisGame === null) firstTurnThisGame = currentTurn;
            }
          }
        }

        totalCopiesPlayed += copiesThisGame;
        if (copiesThisGame > 0) {
          gamesPlayed++;
          totalFirstPlayTurn += firstTurnThisGame!;
          gamesWithFirstPlay++;
        }
      }

      const totalGames = replays.length;
      const avgCopiesPlayed = totalCopiesPlayed / totalGames;
      const playRate = gamesPlayed / totalGames;
      const avgTurnFirstPlayed =
        gamesWithFirstPlay > 0 ? totalFirstPlayTurn / gamesWithFirstPlay : NaN;
      const utilizationScore =
        copiesInDeck > 0 ? Math.min(1, avgCopiesPlayed / copiesInDeck) : 0;

      return {
        cardId,
        cardName,
        copiesInDeck,
        avgCopiesPlayed,
        playRate,
        avgTurnFirstPlayed,
        utilizationScore
      };
    })
    .sort((a, b) => b.playRate - a.playRate);
}

// ─── Turn Length Distribution ─────────────────────────────────────────────────

export function transformTurnDistribution(
  gameResults: ReadonlyArray<GameResult>
): ReadonlyArray<TurnLengthBucket> {
  if (gameResults.length === 0) return [];

  const maxTurns = Math.max(...gameResults.map((r) => r.totalTurns));
  const bucketSize = 5;
  const numBuckets = Math.ceil(maxTurns / bucketSize);

  const buckets: TurnLengthBucket[] = Array.from(
    { length: numBuckets },
    (_, i): TurnLengthBucket => ({
      minTurn: i * bucketSize + 1,
      maxTurn: (i + 1) * bucketSize,
      label: `${i * bucketSize + 1}-${(i + 1) * bucketSize}`,
      player1Wins: 0,
      player2Wins: 0,
      draws: 0,
      total: 0
    })
  );

  for (const result of gameResults) {
    const bucketIndex = Math.min(
      Math.floor((result.totalTurns - 1) / bucketSize),
      numBuckets - 1
    );
    const bucket = buckets[bucketIndex];
    if (!bucket) continue;

    const updated = {
      ...bucket,
      total: bucket.total + 1,
      player1Wins: bucket.player1Wins + (result.winner === 'player1' ? 1 : 0),
      player2Wins: bucket.player2Wins + (result.winner === 'player2' ? 1 : 0),
      draws: bucket.draws + (result.winner === 'draw' ? 1 : 0)
    };
    buckets[bucketIndex] = updated;
  }

  return buckets.filter((b) => b.total > 0);
}
