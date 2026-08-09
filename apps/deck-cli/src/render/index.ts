import { createPlainRenderer } from './plain';
import type { Renderer } from './types';

export interface CreateRendererOptions {
  /** undefined = auto-detect, true = force TUI, false = force plain. */
  readonly tui?: boolean;
  readonly showReasoning: boolean;
}

/** Below this the tabbed layout cannot be laid out legibly. */
const MIN_COLUMNS = 50;

export interface RendererChoice {
  readonly renderer: Renderer;
  readonly mode: 'tui' | 'plain';
  readonly reason: string | null;
}

/**
 * Synchronous so callers can know the mode *before* spawning the MCP server —
 * in TUI mode the server's stderr must be captured rather than inherited, or
 * its tracing output punches through the alternate screen.
 */
export function selectRendererMode(tui: boolean | undefined): {
  mode: 'tui' | 'plain';
  reason: string | null;
} {
  if (tui === false) return { mode: 'plain', reason: null };

  const interactive = process.stdout.isTTY === true && process.stdin.isTTY === true;
  if (!interactive) {
    // Alternate-screen output redirected to a file or pipe is escape-sequence
    // garbage, so non-TTY always falls back regardless of --tui.
    return {
      mode: 'plain',
      reason: tui === true ? 'not a terminal — falling back to plain output' : null
    };
  }

  // A pty that hasn't had its window size set reports 0 — that means "unknown",
  // not "zero columns wide", so only a real measurement should force fallback.
  const reported = process.stdout.columns;
  const columns = reported === undefined || reported === 0 ? 80 : reported;
  if (columns < MIN_COLUMNS) {
    return {
      mode: 'plain',
      reason: `terminal is ${columns} columns (need ${MIN_COLUMNS}) — falling back to plain output`
    };
  }

  return { mode: 'tui', reason: null };
}

export async function createRenderer(options: CreateRendererOptions): Promise<RendererChoice> {
  const { mode, reason } = selectRendererMode(options.tui);

  if (mode === 'plain') {
    return {
      renderer: createPlainRenderer({ showReasoning: options.showReasoning }),
      mode,
      reason
    };
  }

  const { createTuiRenderer } = await import('../tui/renderer');
  return {
    renderer: createTuiRenderer({ showReasoning: options.showReasoning }),
    mode,
    reason
  };
}
