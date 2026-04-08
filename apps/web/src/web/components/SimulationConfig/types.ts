export interface SimulationUserConfig {
  readonly gameCount: number;
  readonly keyCardIds: ReadonlyArray<string>;
  readonly formatDate: string;
  readonly matchupMode: 'single' | 'matrix';
}

export interface SimulationConfigProps {
  readonly config: SimulationUserConfig;
  readonly onChange: (config: SimulationUserConfig) => void;
  readonly playerDeckCards: ReadonlyArray<{ readonly cardId: string; readonly count: number }>;
}

export const GAME_COUNT_STEPS = [100, 200, 500, 1000, 2000, 5000, 10000] as const;
export type GameCountStep = (typeof GAME_COUNT_STEPS)[number];
