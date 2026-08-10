import { describe, expect, test } from 'bun:test';

import { buildSessionMarkdown } from './export';
import { TuiStore } from './store';

function storeWithHistory(...entries: string[]): TuiStore {
  const store = new TuiStore();
  for (const entry of entries) {
    const pending = store.awaitInput();
    void pending;
    store.submit(entry);
  }
  return store;
}

describe('history navigation', () => {
  test('walks backwards from newest and stops at the oldest', () => {
    const store = storeWithHistory('first', 'second', 'third');

    store.navigateHistory(-1);
    expect(store.draft).toBe('third');
    store.navigateHistory(-1);
    expect(store.draft).toBe('second');
    store.navigateHistory(-1);
    expect(store.draft).toBe('first');
    store.navigateHistory(-1);
    expect(store.draft).toBe('first');
  });

  test('walking forward past the newest clears the draft', () => {
    const store = storeWithHistory('only');

    store.navigateHistory(-1);
    expect(store.draft).toBe('only');
    store.navigateHistory(1);
    expect(store.draft).toBe('');
    expect(store.historyIndex).toBeNull();
  });

  test('is a no-op with no history', () => {
    const store = new TuiStore();
    store.navigateHistory(-1);
    expect(store.draft).toBe('');
  });

  test('submitting records the question in the transcript', () => {
    // Regression: the transcript previously showed only agent output, reasoning
    // and tool logs — the user's own messages were never added, so it did not
    // read as a conversation.
    const store = new TuiStore();
    store.awaitInput();
    store.submit('is 15 energy too many?');

    const user = store.entries.filter((e) => e.kind === 'user');
    expect(user).toHaveLength(1);
    expect(user[0]).toMatchObject({ kind: 'user', text: 'is 15 energy too many?' });
  });

  test('submitting resets navigation and remounts the input', () => {
    const store = storeWithHistory('a');
    store.navigateHistory(-1);
    const epochAfterNav = store.inputEpoch;

    store.awaitInput();
    store.submit('b');

    expect(store.historyIndex).toBeNull();
    expect(store.draft).toBe('');
    expect(store.inputEpoch).toBeGreaterThan(epochAfterNav);
    expect(store.history).toEqual(['a', 'b']);
  });
});

describe('stats tab', () => {
  test('loads once, on first view, and not before', async () => {
    const store = new TuiStore();
    let calls = 0;
    store.loadStats = async () => {
      calls += 1;
      return 'REPORT';
    };

    await store.ensureStats();
    expect(calls).toBe(0); // still on the deck tab

    store.setTab('stats');
    await store.ensureStats();
    expect(calls).toBe(1);
    expect(store.stats).toBe('REPORT');

    await store.ensureStats();
    expect(calls).toBe(1); // cached
  });

  test('surfaces loader failures instead of throwing', async () => {
    const store = new TuiStore();
    store.loadStats = async () => {
      throw new Error('mcp down');
    };
    store.setTab('stats');
    await store.ensureStats();
    expect(store.stats).toContain('mcp down');
  });
});

describe('session export', () => {
  test('renders questions, answers and tool calls as markdown', () => {
    const md = buildSessionMarkdown({
      entries: [
        { kind: 'user', text: 'is 15 energy too many?' },
        { kind: 'tool', name: 'get_card_by_id', state: 'ok' },
        { kind: 'assistant', text: 'No — **15 is justified**.', done: true }
      ],
      reasoning: 'weighed the energy curve',
      providerName: 'anthropic',
      model: 'claude-sonnet-5',
      deckNames: ['Mega Gardevoir ex'],
      includeReasoning: true
    });

    expect(md).toContain('## is 15 energy too many?');
    expect(md).toContain('No — **15 is justified**.');
    expect(md).toContain('`get_card_by_id`');
    expect(md).toContain('claude-sonnet-5');
    expect(md).toContain('weighed the energy curve');
  });

  test('omits the reasoning section when not requested', () => {
    const md = buildSessionMarkdown({
      entries: [{ kind: 'user', text: 'hi' }],
      reasoning: 'secret',
      providerName: 'ollama',
      model: 'qwen3-coder:30b',
      deckNames: [],
      includeReasoning: false
    });

    expect(md).not.toContain('secret');
    expect(md).toContain('(none)');
  });
});
