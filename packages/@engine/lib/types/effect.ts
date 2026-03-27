// Placeholder for SPEC_04 (Card Effects).
// TemporalEffect represents a persistent effect active during a game — e.g. attack
// modifiers, ability locks, or end-of-turn triggers. Fully specified in SPEC_04.

export interface TemporalEffect {
  readonly id: string;
  readonly type: string;
  readonly sourceInstanceId: string;
  readonly targetInstanceId: string | null;
  readonly expiresOnTurn: number | null;
  readonly payload: Readonly<Record<string, unknown>>;
}
