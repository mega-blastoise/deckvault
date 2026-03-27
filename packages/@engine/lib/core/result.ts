export type GameErrorCode = 'INVALID_DECK' | 'ILLEGAL_ACTION' | 'INVALID_STATE' | 'UNKNOWN_CARD';

export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
}

export type GameResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: GameError };

export function ok<T>(value: T): GameResult<T> {
  return { ok: true, value };
}

export function err(code: GameErrorCode, message: string): GameResult<never> {
  return { ok: false, error: { code, message } };
}
