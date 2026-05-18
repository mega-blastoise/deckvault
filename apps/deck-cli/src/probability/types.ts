export type TurnCurveEntry = {
  turn: number;
  pAtLeastOne: number;
};

export type CardProbability = {
  cardId: string;
  name: string;
  copies: number;
  pOpen: number;
  pExactlyOne: number;
  pExactlyTwo: number;
  pPrized: number | null;
  turnCurve: TurnCurveEntry[];
  spotlight: boolean;
};

export type PrizedEntry = {
  cardId: string;
  name: string;
  copies: number;
  pPrized: number;
};

export type ProbabilityReport = {
  deckSize: number;
  complete: boolean;
  openingHand: CardProbability[];
  prizedRisk: PrizedEntry[];
};
