import type { AgentMessage } from '../providers/types';
import type { EnrichedDeck } from '../deck/types';

/**
 * The agent loop emits these instead of writing to stdout directly, so the
 * same loop drives both the plain renderer and the full-screen TUI.
 */
export type RenderEvent =
  | { readonly type: 'turn-start' }
  | { readonly type: 'reasoning-start' }
  | { readonly type: 'reasoning-delta'; readonly text: string }
  | { readonly type: 'reasoning-end' }
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'tool-call'; readonly name: string }
  | { readonly type: 'tool-result'; readonly name: string; readonly isError: boolean }
  | { readonly type: 'turn-end' }
  | { readonly type: 'notice'; readonly text: string }
  | { readonly type: 'error'; readonly text: string };

export interface SessionContext {
  readonly providerName: string;
  readonly model: string;
  readonly decks: readonly EnrichedDeck[];
  /**
   * Lazily computes the probability report. Called the first time the stats
   * tab is opened rather than at startup, so sessions that never look at it
   * don't pay for the tool call.
   */
  readonly loadStats?: () => Promise<string>;
}

export interface Renderer {
  /** Called once before the session starts. */
  start(context: SessionContext): Promise<void>;
  /** Read the next user message, or null when input is exhausted (EOF/quit). */
  prompt(): Promise<string | null>;
  emit(event: RenderEvent): void;
  /**
   * Tear down. The TUI restores the normal screen and replays the transcript
   * to stdout so the conversation survives in scrollback.
   */
  stop(messages: readonly AgentMessage[]): Promise<void>;
}
