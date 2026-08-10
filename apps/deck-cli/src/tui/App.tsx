import { useRef, useSyncExternalStore } from 'react';
import { useKeyboard, useTerminalDimensions } from '@opentui/react';
import { SyntaxStyle, type ScrollBoxRenderable } from '@opentui/core';

import type { EnrichedDeck } from '../deck/types';
import { exportSession } from './export';
import { TABS, type Entry, type TuiStore } from './store';

const SIDEBAR_WIDTH = 28;
const SIDEBAR_MIN_COLUMNS = 90;

/**
 * `syntaxStyle` is required without it the renderable silently
 * skips parsing and emits the raw markdown source. SyntaxStyle.create() is the
 * documented factory; the bare constructor takes native handles.
 */
const SYNTAX_STYLE = SyntaxStyle.create();

const Markdown = 'markdown' as unknown as (props: {
  content: string;
  streaming: boolean;
  syntaxStyle: SyntaxStyle;
}) => React.ReactElement;


function deckSummary(deck: EnrichedDeck): string {
  const group = (supertype: string) =>
    deck.cards.filter((c) => c.card?.supertype === supertype);
  const total = (entries: ReturnType<typeof group>) =>
    entries.reduce((n, c) => n + c.quantity, 0);

  const pokemon = group('Pokémon');
  const trainers = group('Trainer');
  const energy = group('Energy');

  const lines = [
    deck.name,
    `${deck.totalCards}/60 · marks ${deck.regulationMarks.join(',')}`,
    '',
    `Pokémon  ${String(total(pokemon)).padStart(3)}`
  ];
  for (const c of pokemon.slice(0, 6)) {
    lines.push(`  ${c.quantity} ${c.card?.name ?? c.id}`);
  }
  lines.push(`Trainer  ${String(total(trainers)).padStart(3)}`);
  for (const c of trainers.slice(0, 5)) {
    lines.push(`  ${c.quantity} ${c.card?.name ?? c.id}`);
  }
  lines.push(`Energy   ${String(total(energy)).padStart(3)}`);
  return lines.join('\n');
}

const MUTED = '#6b7280';
const USER = '#7dd3fc';

/**
 * Each turn reads as a conversation: the question, then the agent's working
 * (reasoning and tool calls, dimmed and indented), then the answer.
 */
function TranscriptEntry({
  entry,
  expanded
}: {
  entry: Entry;
  expanded: boolean;
}): React.ReactNode {
  switch (entry.kind) {
    case 'user':
      return (
        <box flexDirection="column" flexShrink={0} marginTop={1}>
          <text fg={USER} attributes={1}>{`› ${entry.text}`}</text>
        </box>
      );
    case 'assistant':
      return (
        <box flexDirection="column" flexShrink={0} marginTop={1} paddingLeft={2}>
          <Markdown content={entry.text} streaming={!entry.done} syntaxStyle={SYNTAX_STYLE} />
        </box>
      );
    case 'reasoning':
      return (
        <box flexDirection="column" flexShrink={0} paddingLeft={2}>
          <text fg={MUTED}>{entry.done ? '▸ thought' : '▸ thinking…'}</text>
          {expanded && entry.text ? <text fg={MUTED}>{entry.text}</text> : null}
        </box>
      );
    case 'tool': {
      const mark = entry.state === 'running' ? '⏺' : entry.state === 'ok' ? '⏺' : '⏹';
      const colour = entry.state === 'error' ? 'red' : entry.state === 'ok' ? '#4ade80' : MUTED;
      return (
        <box flexShrink={0} paddingLeft={2}>
          <text fg={colour}>{`${mark} ${entry.name}`}</text>
        </box>
      );
    }
    case 'error':
      return (
        <box flexShrink={0} marginTop={1} paddingLeft={2}>
          <text fg="red">{entry.text}</text>
        </box>
      );
  }
}

export function App({ store }: { store: TuiStore }): React.ReactNode {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const scrollRef = useRef<ScrollBoxRenderable | null>(null);
  store.scrollTarget = scrollRef;
  const { width } = useTerminalDimensions();

  const showSidebar = store.sidebarVisible && width >= SIDEBAR_MIN_COLUMNS;

  useKeyboard((key) => {
    if (key.name === 'tab') store.cycleTab(key.shift ? -1 : 1);
    else if (key.name === 'up') store.navigateHistory(-1);
    else if (key.name === 'down') store.navigateHistory(1);
    else if (key.ctrl && key.name === 'r') {
      store.showReasoning = !store.showReasoning;
      store.notify();
    } else if (key.name === 'pageup' || key.name === 'pagedown') {
      store.scrollBy(key.name === 'pageup' ? -1 : 1);
    }
    else if (key.ctrl && key.name === 's') {
      store.sidebarVisible = !store.sidebarVisible;
      store.notify();
    } else if (key.ctrl && key.name === 'e') {
      try {
        const path = exportSession({
          entries: store.entries,
          reasoning: store.reasoning,
          providerName: store.status.providerName,
          model: store.status.model,
          deckNames: store.decks.map((d) => d.name),
          includeReasoning: true
        });
        store.notice = `Exported to ${path}`;
      } catch (err) {
        store.notice = `Export failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      store.notify();
    } else if (key.ctrl && (key.name === 'd' || key.name === 'c')) {
      store.quit();
    }
  });

  const sidebarBody =
    store.tab === 'deck'
      ? store.decks.length > 0
        ? store.decks.map(deckSummary).join('\n\n')
        : 'No deck loaded.'
      : (store.stats ?? 'Opening… (press ⇥ to load)');

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box flexDirection="row" flexGrow={1} minHeight={0}>
        <scrollbox
          ref={scrollRef}
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          minHeight={0}
          paddingLeft={1}
          paddingRight={1}
          stickyScroll
        >
          {store.entries.map((entry, i) => (
            <TranscriptEntry key={i} entry={entry} expanded={store.showReasoning} />
          ))}
        </scrollbox>
        {showSidebar ? (
          <box
            width={SIDEBAR_WIDTH}
            flexShrink={0}
            flexDirection="column"
            minHeight={0}
            border
            borderColor="gray"
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg="white">
              {TABS.map((t) => (t === store.tab ? `[${t}]` : ` ${t} `)).join('')}
            </text>
            <scrollbox flexGrow={1} flexShrink={1} minHeight={0} minWidth={0}>
              <text fg="gray">{sidebarBody}</text>
            </scrollbox>
          </box>
        ) : null}
      </box>

      <box
        flexShrink={0}
        border
        borderColor={store.status.busy ? 'gray' : 'cyan'}
        paddingLeft={1}
      >
        {store.status.busy ? (
          <text fg="gray">working…</text>
        ) : (
          <input
            // Remounting on epoch change is how history navigation replaces the
            // text without fighting the input's internal cursor position.
            key={store.inputEpoch}
            value={store.draft}
            placeholder="Ask about the deck…"
            focused
            // Mirror keystrokes into the store without notifying — re-rendering
            // per character would be pure churn, and keeping draft in sync means
            // an unrelated re-render can't wipe what's been typed.
            onInput={(value: string) => {
              store.draft = value;
            }}
            // InputProps declares onSubmit twice — once from the renderable's
            // event map as (event: SubmitEvent) and once as (value: string) —
            // and the intersection is unsatisfiable. Runtime passes the string.
            onSubmit={
              ((value: string) => {
                const trimmed = value.trim();
                if (trimmed === 'quit' || trimmed === 'exit') store.quit();
                else if (trimmed) store.submit(trimmed);
              }) as never
            }
          />
        )}
      </box>

      <text flexShrink={0} fg={store.notice ? 'green' : 'gray'}>
        {store.notice
          ? ` ${store.notice}`
          : ` ${store.status.providerName} · ${store.status.model} · ⇥ tab  ↑↓ history  ^E export  ^R think  ^S side  ^D quit`}
      </text>
    </box>
  );
}
