import React, { useMemo } from 'react';
import type { AnalyticsDashboardProps } from './types';
import { AnalyticsDashboardView } from './AnalyticsDashboardView';
import {
  transformWinConditions,
  transformPrizeRace,
  transformOpeningHand,
  transformKeyCardCurves,
  transformTrainerUtilization,
  transformTurnDistribution
} from './transforms';
import './AnalyticsDashboard.css';

export function AnalyticsDashboard({
  result,
  keyCardIds,
  definitions,
  perspective,
  playerDeck,
  onPerspectiveChange
}: AnalyticsDashboardProps) {
  const winConditionData = useMemo(
    () => transformWinConditions(result, perspective),
    [result, perspective]
  );

  const prizeRaceData = useMemo(
    () => transformPrizeRace(result.capturedReplays, perspective),
    [result.capturedReplays, perspective]
  );

  const openingHandData = useMemo(
    () => transformOpeningHand(result.capturedReplays, definitions, perspective),
    [result.capturedReplays, definitions, perspective]
  );

  const keyCardCurves = useMemo(
    () => transformKeyCardCurves(result.capturedReplays, keyCardIds, definitions, perspective, playerDeck),
    [result.capturedReplays, keyCardIds, definitions, perspective, playerDeck]
  );

  const trainerEntries = useMemo(
    () => transformTrainerUtilization(result.capturedReplays, playerDeck, definitions, perspective),
    [result.capturedReplays, playerDeck, definitions, perspective]
  );

  const turnBuckets = useMemo(
    () => transformTurnDistribution(result.gameResults),
    [result.gameResults]
  );

  return (
    <AnalyticsDashboardView
      winConditionData={winConditionData}
      prizeRaceData={prizeRaceData}
      openingHandData={openingHandData}
      keyCardCurves={keyCardCurves}
      trainerEntries={trainerEntries}
      turnBuckets={turnBuckets}
      medianTurns={result.medianTurnCount}
      perspective={perspective}
      onPerspectiveChange={onPerspectiveChange}
    />
  );
}
