export type { AiStrategy, AiConfig, ScoredAction } from './types';
export { RandomStrategy, GreedyStrategy } from './strategy';
export { playTurn, runSetupPhase, simulateGame } from './player';
export {
  evaluateBoard, resolveTopDef,
  evalPrizeDifferential, evalActiveHealth, evalKOPotential,
  evalBenchStrength, evalEnergyAdvantage, evalTypeAdvantage
} from './evaluate';
