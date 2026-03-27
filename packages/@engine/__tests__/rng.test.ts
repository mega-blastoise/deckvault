import { describe, expect, it } from 'bun:test';
import { coinFlip, shuffle, randomInt, createRngState } from '../lib/rng';

describe('RNG', () => {
  describe('determinism', () => {
    it('produces identical coinFlip sequences from the same seed', () => {
      const state = createRngState(42);
      const results1: string[] = [];
      const results2: string[] = [];

      let s1 = state;
      let s2 = createRngState(42);
      for (let i = 0; i < 20; i++) {
        const r1 = coinFlip(s1);
        const r2 = coinFlip(s2);
        results1.push(r1.result);
        results2.push(r2.result);
        s1 = r1.nextState;
        s2 = r2.nextState;
      }
      expect(results1).toEqual(results2);
    });

    it('produces different sequences from different seeds', () => {
      let s1 = createRngState(1);
      let s2 = createRngState(99999);
      const results1: string[] = [];
      const results2: string[] = [];

      for (let i = 0; i < 20; i++) {
        const r1 = coinFlip(s1);
        const r2 = coinFlip(s2);
        results1.push(r1.result);
        results2.push(r2.result);
        s1 = r1.nextState;
        s2 = r2.nextState;
      }
      expect(results1).not.toEqual(results2);
    });

    it('produces identical shuffle orders from the same seed', () => {
      const deck = Array.from({ length: 20 }, (_, i) => `card-${i}`);
      const { result: r1 } = shuffle(deck, createRngState(7));
      const { result: r2 } = shuffle(deck, createRngState(7));
      expect(r1).toEqual(r2);
    });
  });

  describe('coinFlip', () => {
    it('returns only heads or tails', () => {
      let state = createRngState(123);
      for (let i = 0; i < 50; i++) {
        const { result, nextState } = coinFlip(state);
        expect(['heads', 'tails']).toContain(result);
        state = nextState;
      }
    });

    it('advances the RNG counter each flip', () => {
      const initial = createRngState(0);
      const { nextState } = coinFlip(initial);
      expect(nextState.counter).toBe(initial.counter + 1);
    });

    it('produces roughly 50% heads over many flips', () => {
      let state = createRngState(12345);
      let heads = 0;
      const n = 1000;
      for (let i = 0; i < n; i++) {
        const { result, nextState } = coinFlip(state);
        if (result === 'heads') heads++;
        state = nextState;
      }
      // Allow ±10% variance
      expect(heads).toBeGreaterThan(n * 0.4);
      expect(heads).toBeLessThan(n * 0.6);
    });
  });

  describe('shuffle', () => {
    it('preserves all elements', () => {
      const deck = ['A', 'B', 'C', 'D', 'E'];
      const { result } = shuffle(deck, createRngState(42));
      expect([...result].sort()).toEqual([...deck].sort());
    });

    it('does not mutate the original array', () => {
      const deck = ['A', 'B', 'C', 'D'];
      const original = [...deck];
      shuffle(deck, createRngState(1));
      expect(deck).toEqual(original);
    });

    it('produces a different order than the original (for large arrays)', () => {
      const deck = Array.from({ length: 60 }, (_, i) => `card-${i}`);
      const { result } = shuffle(deck, createRngState(99));
      expect(result).not.toEqual(deck);
    });
  });

  describe('randomInt', () => {
    it('always returns a value within [min, max]', () => {
      let state = createRngState(777);
      for (let i = 0; i < 100; i++) {
        const { result, nextState } = randomInt(1, 6, state);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(6);
        state = nextState;
      }
    });

    it('returns only the single possible value when min === max', () => {
      const { result } = randomInt(3, 3, createRngState(0));
      expect(result).toBe(3);
    });
  });
});
