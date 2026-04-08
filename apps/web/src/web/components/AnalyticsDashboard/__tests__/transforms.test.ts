import { describe, it, expect } from 'bun:test';
import {
  defIdFromInstanceId,
  transformWinConditions,
  transformPrizeRace,
  transformOpeningHand,
  transformKeyCardCurves,
  transformTrainerUtilization,
  transformTurnDistribution
} from '../transforms';
import type { SerializedSimulationResult, CapturedReplay } from '../../../../workers/simulation.worker';
import type { CardDefinition } from '@pokemon/engine';
import type { ResolvedDeck } from '../../DeckInputPanel/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<SerializedSimulationResult> = {}): SerializedSimulationResult {
  return {
    gamesPlayed: 100,
    deck1Wins: 60,
    deck2Wins: 35,
    draws: 5,
    deck1WinRate: 0.6,
    deck2WinRate: 0.35,
    averageTurnCount: 12,
    medianTurnCount: 11,
    averageGameDurationMs: 50,
    gameResults: Array.from({ length: 100 }, (_, i) => ({
      gameIndex: i,
      seed: i,
      winner: i < 60 ? 'player1' : i < 95 ? 'player2' : 'draw',
      winReason: 'all_prizes_taken',
      totalTurns: 10 + (i % 10),
      durationMs: 50,
      player1PrizesTaken: 6,
      player2PrizesTaken: i < 60 ? 3 : 6,
      player1PokemonKOd: 2,
      player2PokemonKOd: 3
    })),
    capturedReplays: [],
    ...overrides
  };
}

function makeReplay(
  gameIndex: number,
  events: ReadonlyArray<import('@pokemon/engine').GameEvent>
): CapturedReplay {
  return {
    gameIndex,
    seed: gameIndex,
    eventLog: events,
    winner: 'player1',
    winReason: 'all_prizes_taken',
    totalTurns: 10
  };
}

const basicDef: CardDefinition = {
  cardType: 'Pokemon',
  id: 'pikachu-ex',
  name: 'Pikachu ex',
  stage: 'Basic',
  subtypes: ['ex'],
  hp: 120,
  types: ['Lightning'],
  evolvesFrom: null,
  attacks: [],
  abilities: [],
  weaknesses: [],
  resistances: [],
  retreatCost: 1,
  rules: [],
  prizeValue: 2,
  regulationMark: 'H'
};

const supporterDef: CardDefinition = {
  cardType: 'Trainer',
  id: 'boss-orders',
  name: "Boss's Orders",
  subtypes: ['Supporter'],
  rules: [],
  effectId: 'boss_orders'
};

const trainerDef: CardDefinition = {
  cardType: 'Trainer',
  id: 'ultra-ball',
  name: 'Ultra Ball',
  subtypes: ['Item'],
  rules: [],
  effectId: 'ultra_ball'
};

const energyDef: CardDefinition = {
  cardType: 'Energy',
  id: 'lightning-energy',
  name: 'Lightning Energy',
  subtype: 'Basic',
  provides: ['Lightning'],
  rules: [],
  effectId: null,
  isAceSpec: false
};

const definitions: Record<string, CardDefinition> = {
  'pikachu-ex': basicDef,
  'boss-orders': supporterDef,
  'ultra-ball': trainerDef,
  'lightning-energy': energyDef
};

const deck: ResolvedDeck = {
  name: 'Test Deck',
  source: 'paste',
  totalCards: 60,
  cards: [
    { cardId: 'pikachu-ex', count: 4 },
    { cardId: 'boss-orders', count: 2 },
    { cardId: 'ultra-ball', count: 4 },
    { cardId: 'lightning-energy', count: 10 }
  ]
};

// ─── defIdFromInstanceId ──────────────────────────────────────────────────────

describe('defIdFromInstanceId', () => {
  it('strips p1 prefix and count suffix', () => {
    expect(defIdFromInstanceId('p1-pikachu-ex-0')).toBe('pikachu-ex');
  });

  it('strips p2 prefix and count suffix', () => {
    expect(defIdFromInstanceId('p2-ultra-ball-3')).toBe('ultra-ball');
  });

  it('handles multi-hyphen card ids', () => {
    expect(defIdFromInstanceId('p1-boss-orders-1')).toBe('boss-orders');
  });

  it('returns input if no prefix detected', () => {
    expect(defIdFromInstanceId('pikachu-ex')).toBe('pikachu-ex');
  });
});

// ─── transformWinConditions ───────────────────────────────────────────────────

describe('transformWinConditions', () => {
  it('returns empty segments for zero games', () => {
    const empty = makeResult({ gamesPlayed: 0, deck1Wins: 0, deck2Wins: 0, draws: 0, gameResults: [] });
    const data = transformWinConditions(empty, 'player1');
    expect(data.total).toBe(0);
    expect(data.segments).toHaveLength(0);
  });

  it('segments sum to 100% of total', () => {
    const result = makeResult();
    const data = transformWinConditions(result, 'player1');
    const sum = data.segments.reduce((a, s) => a + s.count, 0);
    expect(sum).toBe(result.gamesPlayed);
  });

  it('includes draw segment when draws > 0', () => {
    const result = makeResult();
    const data = transformWinConditions(result, 'player1');
    const drawSeg = data.segments.find((s) => s.label === 'Draw');
    expect(drawSeg).toBeDefined();
    expect(drawSeg!.count).toBe(5);
  });

  it('perspective swap changes win/loss counts', () => {
    const result = makeResult();
    const p1 = transformWinConditions(result, 'player1');
    const p2 = transformWinConditions(result, 'player2');
    const p1Wins = p1.segments
      .filter((s) => s.label.includes('(You)'))
      .reduce((a, s) => a + s.count, 0);
    const p2Wins = p2.segments
      .filter((s) => s.label.includes('(You)'))
      .reduce((a, s) => a + s.count, 0);
    expect(p1Wins).toBe(60);
    expect(p2Wins).toBe(35);
  });
});

// ─── transformPrizeRace ───────────────────────────────────────────────────────

describe('transformPrizeRace', () => {
  it('returns empty for no replays', () => {
    const data = transformPrizeRace([], 'player1');
    expect(data.points).toHaveLength(0);
    expect(data.maxTurn).toBe(0);
  });

  it('builds points from PRIZE_TAKEN events', () => {
    const replay = makeReplay(0, [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'PRIZE_TAKEN', player: 'player1', cardInstanceId: 'p1-pikachu-ex-0' },
      { type: 'TURN_STARTED', player: 'player2', turnNumber: 2 },
      { type: 'PRIZE_TAKEN', player: 'player2', cardInstanceId: 'p2-pikachu-ex-0' }
    ]);
    const data = transformPrizeRace([replay], 'player1');
    expect(data.points.length).toBeGreaterThan(0);
  });

  it('differential is positive when player1 leads', () => {
    const replay = makeReplay(0, [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'PRIZE_TAKEN', player: 'player1', cardInstanceId: 'p1-pikachu-ex-0' },
      { type: 'PRIZE_TAKEN', player: 'player1', cardInstanceId: 'p1-pikachu-ex-1' }
    ]);
    const data = transformPrizeRace([replay], 'player1');
    const lastPt = data.points[data.points.length - 1];
    expect(lastPt!.meanDifferential).toBeGreaterThan(0);
  });
});

// ─── transformTurnDistribution ────────────────────────────────────────────────

describe('transformTurnDistribution', () => {
  it('returns empty for no results', () => {
    expect(transformTurnDistribution([])).toHaveLength(0);
  });

  it('buckets 5-turn ranges correctly', () => {
    const gameResults = [
      { gameIndex: 0, seed: 0, winner: 'player1' as const, winReason: 'all_prizes_taken' as const, totalTurns: 3, durationMs: 10, player1PrizesTaken: 6, player2PrizesTaken: 0, player1PokemonKOd: 0, player2PokemonKOd: 0 },
      { gameIndex: 1, seed: 1, winner: 'player2' as const, winReason: 'all_prizes_taken' as const, totalTurns: 7, durationMs: 10, player1PrizesTaken: 3, player2PrizesTaken: 6, player1PokemonKOd: 0, player2PokemonKOd: 0 }
    ];
    const buckets = transformTurnDistribution(gameResults);
    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.label).toBe('1-5');
    expect(buckets[1]!.label).toBe('6-10');
  });

  it('counts wins per bucket correctly', () => {
    const gameResults = Array.from({ length: 10 }, (_, i) => ({
      gameIndex: i,
      seed: i,
      winner: 'player1' as const,
      winReason: 'all_prizes_taken' as const,
      totalTurns: 5,
      durationMs: 10,
      player1PrizesTaken: 6,
      player2PrizesTaken: 0,
      player1PokemonKOd: 0,
      player2PokemonKOd: 0
    }));
    const buckets = transformTurnDistribution(gameResults);
    expect(buckets[0]!.player1Wins).toBe(10);
    expect(buckets[0]!.player2Wins).toBe(0);
  });

  it('filters out empty buckets', () => {
    const gameResults = [
      { gameIndex: 0, seed: 0, winner: 'player1' as const, winReason: 'all_prizes_taken' as const, totalTurns: 20, durationMs: 10, player1PrizesTaken: 6, player2PrizesTaken: 0, player1PokemonKOd: 0, player2PokemonKOd: 0 }
    ];
    const buckets = transformTurnDistribution(gameResults);
    expect(buckets.every((b) => b.total > 0)).toBe(true);
  });
});

// ─── transformTrainerUtilization ─────────────────────────────────────────────

describe('transformTrainerUtilization', () => {
  it('returns empty for no replays', () => {
    expect(transformTrainerUtilization([], deck, definitions, 'player1')).toHaveLength(0);
  });

  it('counts trainer plays correctly', () => {
    const replay = makeReplay(0, [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'TRAINER_PLAYED', player: 'player1', cardInstanceId: 'p1-ultra-ball-0' },
      { type: 'TRAINER_PLAYED', player: 'player1', cardInstanceId: 'p1-ultra-ball-1' }
    ]);
    const entries = transformTrainerUtilization([replay], deck, definitions, 'player1');
    const ultraBall = entries.find((e) => e.cardId === 'ultra-ball');
    expect(ultraBall).toBeDefined();
    expect(ultraBall!.avgCopiesPlayed).toBe(2);
    expect(ultraBall!.playRate).toBe(1);
  });

  it('sorted by playRate descending', () => {
    const replay = makeReplay(0, [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'TRAINER_PLAYED', player: 'player1', cardInstanceId: 'p1-ultra-ball-0' }
    ]);
    const entries = transformTrainerUtilization([replay], deck, definitions, 'player1');
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1]!.playRate).toBeGreaterThanOrEqual(entries[i]!.playRate);
    }
  });
});

// ─── transformOpeningHand ────────────────────────────────────────────────────

describe('transformOpeningHand', () => {
  it('returns zeros for empty replays', () => {
    const data = transformOpeningHand([], definitions, 'player1');
    expect(data.mulliganRate).toBe(0);
    expect(data.handArchetypes).toHaveLength(0);
  });

  it('detects mulligan events', () => {
    const replay = makeReplay(0, [
      { type: 'MULLIGAN', player: 'player1', mulliganCount: 1 },
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 }
    ]);
    const data = transformOpeningHand([replay], definitions, 'player1');
    expect(data.mulliganRate).toBe(1);
  });

  it('detects supporter in opening hand', () => {
    const replay = makeReplay(0, [
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'p1-boss-orders-0' },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'p1-pikachu-ex-0' },
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 }
    ]);
    const data = transformOpeningHand([replay], definitions, 'player1');
    expect(data.hasSupporterRate).toBe(1);
  });
});

// ─── transformKeyCardCurves ───────────────────────────────────────────────────

describe('transformKeyCardCurves', () => {
  it('returns empty for no keyCardIds', () => {
    const curves = transformKeyCardCurves([], [], definitions, 'player1', deck);
    expect(curves).toHaveLength(0);
  });

  it('returns empty for no replays', () => {
    const curves = transformKeyCardCurves([], ['pikachu-ex'], definitions, 'player1', deck);
    expect(curves).toHaveLength(0);
  });

  it('produces one curve per key card', () => {
    const replay = makeReplay(0, [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'p1-pikachu-ex-0' }
    ]);
    const curves = transformKeyCardCurves([replay], ['pikachu-ex'], definitions, 'player1', deck);
    expect(curves).toHaveLength(1);
    expect(curves[0]!.cardId).toBe('pikachu-ex');
  });

  it('curve has 10 points (T1-T10)', () => {
    const replay = makeReplay(0, [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'p1-ultra-ball-0' }
    ]);
    const curves = transformKeyCardCurves([replay], ['ultra-ball'], definitions, 'player1', deck);
    expect(curves[0]!.curve).toHaveLength(10);
  });

  it('probability is 1 by T1 if card seen T1', () => {
    const replay = makeReplay(0, [
      { type: 'TURN_STARTED', player: 'player1', turnNumber: 1 },
      { type: 'CARD_DRAWN', player: 'player1', cardInstanceId: 'p1-pikachu-ex-0' }
    ]);
    const curves = transformKeyCardCurves([replay], ['pikachu-ex'], definitions, 'player1', deck);
    expect(curves[0]!.curve[0]!.probability).toBe(1);
  });
});
