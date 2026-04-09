import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { CapturedReplay, SerializedSimulationResult } from '../../../workers/simulation.worker';
import type { CardDefinition } from '@pokemon/engine/browser';
import type { ReplayBoardState, SerializedCardDefinition, GamePickerEntry } from './types';
import {
  buildStateAtEvent,
  buildStateCache,
  computeKeyMoments,
  findNextTurnEventIndex,
  findPrevTurnEventIndex,
  buildInitialState
} from './replay-state';
import { ReplayViewerView } from './ReplayViewerView';

interface ReplayViewerProps {
  readonly replays: ReadonlyArray<CapturedReplay>;
  readonly gameResults: SerializedSimulationResult['gameResults'];
  readonly definitions: Record<string, CardDefinition>;
  readonly deck1Name: string;
  readonly deck2Name: string;
}

function toSerializedDefinitions(
  definitions: Record<string, CardDefinition>
): Record<string, SerializedCardDefinition> {
  const result: Record<string, SerializedCardDefinition> = {};
  for (const [id, def] of Object.entries(definitions)) {
    const serialized: SerializedCardDefinition = {
      id,
      name: def.name,
      cardType: def.cardType,
      hp: def.cardType === 'Pokemon' ? def.hp : undefined,
      stage: def.cardType === 'Pokemon' ? def.stage : undefined,
      provides: def.cardType === 'Energy' ? [...def.provides] : undefined
    };
    result[id] = serialized;
  }
  return result;
}

export function ReplayViewer({
  replays,
  gameResults,
  definitions,
  deck1Name,
  deck2Name
}: ReplayViewerProps) {
  const replaySet = useMemo(
    () => new Set(replays.map((r) => r.gameIndex)),
    [replays]
  );

  const serializedDefs = useMemo(
    () => toSerializedDefinitions(definitions),
    [definitions]
  );

  const replayByIndex = useMemo(() => {
    const map = new Map<number, CapturedReplay>();
    for (const r of replays) map.set(r.gameIndex, r);
    return map;
  }, [replays]);

  const firstReplayIndex = replays[0]?.gameIndex ?? 0;
  const [selectedGameIndex, setSelectedGameIndex] = useState(firstReplayIndex);
  const [currentEventIndex, setCurrentEventIndex] = useState(-1);
  const [boardState, setBoardState] = useState<ReplayBoardState>(buildInitialState());

  const activeReplay = replayByIndex.get(selectedGameIndex) ?? replays[0] ?? null;

  const cache = useMemo(() => {
    if (!activeReplay) return null;
    return buildStateCache(activeReplay, serializedDefs);
  }, [activeReplay, serializedDefs]);

  const navigateTo = useCallback(
    (index: number) => {
      if (!activeReplay) return;
      const clamped = Math.max(-1, Math.min(index, activeReplay.eventLog.length - 1));
      const newState = buildStateAtEvent(activeReplay, clamped, serializedDefs, cache ?? undefined);
      setCurrentEventIndex(clamped);
      setBoardState(newState);
    },
    [activeReplay, serializedDefs, cache]
  );

  useEffect(() => {
    navigateTo(-1);
  }, [selectedGameIndex, navigateTo]);

  const keyMoments = useMemo(
    () => (activeReplay ? computeKeyMoments(activeReplay.eventLog) : []),
    [activeReplay]
  );

  const games: ReadonlyArray<GamePickerEntry> = useMemo(
    () =>
      gameResults.map((r) => ({
        gameIndex: r.gameIndex,
        winner: r.winner,
        winReason: r.winReason,
        totalTurns: r.totalTurns,
        hasCapturedReplay: replaySet.has(r.gameIndex)
      })),
    [gameResults, replaySet]
  );

  const highlightedInstanceId = useMemo(() => {
    if (!activeReplay) return undefined;
    const event = activeReplay.eventLog[currentEventIndex];
    if (!event) return undefined;
    switch (event.type) {
      case 'ATTACK_DECLARED': return event.attackerInstanceId;
      case 'DAMAGE_DEALT': return event.targetInstanceId;
      case 'DAMAGE_COUNTERS_PLACED': return event.targetInstanceId;
      case 'DAMAGE_HEALED': return event.targetInstanceId;
      case 'POKEMON_KNOCKED_OUT': return event.pokemonInstanceId;
      case 'SPECIAL_CONDITION_APPLIED': return event.pokemonInstanceId;
      case 'SPECIAL_CONDITION_REMOVED': return event.pokemonInstanceId;
      default: return undefined;
    }
  }, [activeReplay, currentEventIndex]);

  const totalEvents = activeReplay?.eventLog.length ?? 0;

  const handlePrevEvent = useCallback(() => navigateTo(currentEventIndex - 1), [navigateTo, currentEventIndex]);
  const handleNextEvent = useCallback(() => navigateTo(currentEventIndex + 1), [navigateTo, currentEventIndex]);

  const handlePrevTurn = useCallback(() => {
    if (!activeReplay) return;
    navigateTo(findPrevTurnEventIndex(activeReplay.eventLog, currentEventIndex));
  }, [activeReplay, currentEventIndex, navigateTo]);

  const handleNextTurn = useCallback(() => {
    if (!activeReplay) return;
    navigateTo(findNextTurnEventIndex(activeReplay.eventLog, currentEventIndex));
  }, [activeReplay, currentEventIndex, navigateTo]);

  const handleJumpToStart = useCallback(() => navigateTo(-1), [navigateTo]);
  const handleJumpToEnd = useCallback(() => navigateTo(totalEvents - 1), [navigateTo, totalEvents]);

  const handleSelectGame = useCallback((gameIndex: number) => {
    setSelectedGameIndex(gameIndex);
  }, []);

  return (
    <ReplayViewerView
      boardState={boardState}
      definitions={serializedDefs}
      deck1Name={deck1Name}
      deck2Name={deck2Name}
      events={activeReplay?.eventLog ?? []}
      currentEventIndex={currentEventIndex}
      currentTurn={boardState.turnNumber}
      totalTurns={activeReplay?.totalTurns ?? 0}
      totalEvents={totalEvents}
      keyMoments={keyMoments}
      games={games}
      selectedGameIndex={selectedGameIndex}
      highlightedInstanceId={highlightedInstanceId}
      onPrevEvent={handlePrevEvent}
      onNextEvent={handleNextEvent}
      onPrevTurn={handlePrevTurn}
      onNextTurn={handleNextTurn}
      onJumpToStart={handleJumpToStart}
      onJumpToEnd={handleJumpToEnd}
      onJumpToMoment={navigateTo}
      onEventClick={navigateTo}
      onSelectGame={handleSelectGame}
    />
  );
}
