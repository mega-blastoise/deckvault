// Seeded PRNG using mulberry32. All functions are pure — they return the next
// RNG state alongside the result so the caller can thread state through.

export interface RngState {
  readonly seed: number;
  readonly counter: number;
}

function mulberry32(seed: number): number {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function nextState(state: RngState): { value: number; nextState: RngState } {
  const combined = (state.seed ^ (state.counter * 1664525 + 1013904223)) >>> 0;
  const value = mulberry32(combined);
  return { value, nextState: { seed: state.seed, counter: state.counter + 1 } };
}

export function coinFlip(state: RngState): { result: 'heads' | 'tails'; nextState: RngState } {
  const { value, nextState: ns } = nextState(state);
  return { result: value < 0.5 ? 'heads' : 'tails', nextState: ns };
}

export function shuffle<T>(
  array: ReadonlyArray<T>,
  state: RngState
): { result: ReadonlyArray<T>; nextState: RngState } {
  const arr = [...array];
  let current = state;
  for (let i = arr.length - 1; i > 0; i--) {
    const { value, nextState: ns } = nextState(current);
    current = ns;
    const j = Math.floor(value * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return { result: arr, nextState: current };
}

export function randomInt(
  min: number,
  max: number,
  state: RngState
): { result: number; nextState: RngState } {
  const { value, nextState: ns } = nextState(state);
  return { result: Math.floor(value * (max - min + 1)) + min, nextState: ns };
}

export function createRngState(seed: number): RngState {
  return { seed, counter: 0 };
}
