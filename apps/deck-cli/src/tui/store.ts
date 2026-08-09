import type { EnrichedDeck } from '../deck/types';

/** Minimal surface of ScrollBoxRenderable that the store drives. */
export interface ScrollTarget {
  scrollBy(delta: number | { x: number; y: number }): void;
  readonly height?: number;
}

export type Entry =
  | { readonly kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; done: boolean }
  | { kind: 'tool'; readonly name: string; state: 'running' | 'ok' | 'error' }
  | { kind: 'reasoning'; text: string; done: boolean }
  | { readonly kind: 'error'; text: string };

/** Reasoning streams inline in the transcript, so the sidebar is deck + stats. */
export type Tab = 'deck' | 'stats';
export const TABS: readonly Tab[] = ['deck', 'stats'];

export interface Status {
  providerName: string;
  model: string;
  busy: boolean;
}

/**
 * The agent loop is imperative and React needs a snapshot source, so state
 * lives here and components subscribe via useSyncExternalStore. getSnapshot
 * returns a version counter — components read fields off the store directly,
 * which avoids allocating a new snapshot object on every streamed token.
 */
export class TuiStore {
  entries: Entry[] = [];
  reasoning = '';
  decks: readonly EnrichedDeck[] = [];
  stats: string | null = null;
  loadStats: (() => Promise<string>) | null = null;
  status: Status = { providerName: '', model: '', busy: false };
  tab: Tab = 'deck';
  sidebarVisible = true;
  /** Toggled with ^R: collapses inline reasoning to just the marker line. */
  showReasoning = true;
  /** Set by App so PgUp/PgDn can drive the transcript viewport. */
  scrollTarget: { current: ScrollTarget | null } | null = null;
  notice: string | null = null;

  /** Submitted prompts, newest last. Navigated with ↑/↓. */
  history: string[] = [];
  historyIndex: number | null = null;
  draft = '';
  /**
   * Bumped to remount the input with a new initialValue. Setting `value` on
   * every render would fight the input's own cursor state while typing.
   */
  inputEpoch = 0;
  statsRequested = false;

  private version = 0;
  private readonly listeners = new Set<() => void>();
  private pending: ((value: string | null) => void) | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): number => this.version;

  notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** Resolved by submit() or quit() from the input component. */
  awaitInput(): Promise<string | null> {
    return new Promise((resolve) => {
      this.pending = resolve;
      this.status.busy = false;
      this.notify();
    });
  }

  submit(text: string): void {
    const resolve = this.pending;
    if (!resolve) return;
    this.pending = null;
    // The transcript is a conversation, so the question has to appear in it —
    // without this the pane is only agent output, reasoning and tool logs.
    this.entries.push({ kind: 'user', text });
    this.history.push(text);
    this.historyIndex = null;
    this.draft = '';
    this.inputEpoch += 1;
    this.status.busy = true;
    this.notify();
    resolve(text);
  }

  /** direction -1 walks toward older entries, +1 toward newer. */
  navigateHistory(direction: -1 | 1): void {
    if (this.history.length === 0) return;

    if (direction === -1) {
      this.historyIndex =
        this.historyIndex === null
          ? this.history.length - 1
          : Math.max(0, this.historyIndex - 1);
    } else {
      if (this.historyIndex === null) return;
      this.historyIndex += 1;
      if (this.historyIndex >= this.history.length) {
        // Walked past the newest entry — back to an empty prompt.
        this.historyIndex = null;
        this.draft = '';
        this.inputEpoch += 1;
        this.notify();
        return;
      }
    }

    this.draft = this.history[this.historyIndex] ?? '';
    this.inputEpoch += 1;
    this.notify();
  }

  quit(): void {
    const resolve = this.pending;
    this.pending = null;
    resolve?.(null);
  }

  appendAssistant(text: string): void {
    const last = this.entries[this.entries.length - 1];
    if (last && last.kind === 'assistant' && !last.done) {
      last.text += text;
    } else {
      this.entries.push({ kind: 'assistant', text, done: false });
    }
    this.notify();
  }

  closeAssistant(): void {
    const last = this.entries[this.entries.length - 1];
    if (last && last.kind === 'assistant') last.done = true;
    this.notify();
  }

  startReasoning(): void {
    this.entries.push({ kind: 'reasoning', text: '', done: false });
    this.notify();
  }

  appendReasoning(text: string): void {
    const last = this.entries[this.entries.length - 1];
    if (last && last.kind === 'reasoning' && !last.done) {
      last.text += text;
    } else {
      this.entries.push({ kind: 'reasoning', text, done: false });
    }
    // Kept separately so ^E export and the plain renderer can still use it.
    this.reasoning += text;
    this.notify();
  }

  endReasoning(): void {
    const last = this.entries[this.entries.length - 1];
    if (last && last.kind === 'reasoning') last.done = true;
    this.notify();
  }

  markTool(name: string, state: 'ok' | 'error'): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      if (entry.kind === 'tool' && entry.name === name && entry.state === 'running') {
        entry.state = state;
        break;
      }
    }
    this.notify();
  }

  /** direction -1 pages up, +1 pages down. */
  scrollBy(direction: -1 | 1): void {
    const target = this.scrollTarget?.current;
    if (!target) return;
    const page = Math.max(1, (target.height ?? 12) - 1);
    target.scrollBy({ x: 0, y: direction * page });
  }

  cycleTab(direction: 1 | -1): void {
    const index = TABS.indexOf(this.tab);
    this.tab = TABS[(index + direction + TABS.length) % TABS.length]!;
    this.notify();
    void this.ensureStats();
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    this.notify();
    void this.ensureStats();
  }

  /** Fetches the probability report once, the first time the tab is shown. */
  async ensureStats(): Promise<void> {
    if (this.tab !== 'stats' || this.statsRequested || !this.loadStats) return;
    this.statsRequested = true;
    this.stats = 'Computing…';
    this.notify();
    try {
      this.stats = await this.loadStats();
    } catch (err) {
      this.stats = `Failed to compute stats: ${err instanceof Error ? err.message : String(err)}`;
    }
    this.notify();
  }
}
