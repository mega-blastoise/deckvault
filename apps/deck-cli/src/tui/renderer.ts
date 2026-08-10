import { createElement } from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';

import type { AgentMessage } from '../providers/types';
import type { RenderEvent, Renderer, SessionContext } from '../render/types';
import { App } from './App';
import { TuiStore } from './store';

export interface TuiRendererOptions {
  readonly showReasoning: boolean;
}

/**
 * Replayed to stdout after the alternate screen is torn down, so the
 * conversation survives in scrollback — the thing full-screen mode otherwise
 * costs you.
 */
function transcriptToText(messages: readonly AgentMessage[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      lines.push(`You: ${message.content}`, '');
    } else if (message.role === 'assistant') {
      for (const call of message.toolCalls) lines.push(`[tool: ${call.name}]`);
      if (message.text.trim()) lines.push(message.text.trim(), '');
    }
  }
  return lines.join('\n');
}

export function createTuiRenderer(options: TuiRendererOptions): Renderer {
  const store = new TuiStore();
  let root: ReturnType<typeof createRoot> | null = null;
  let cli: Awaited<ReturnType<typeof createCliRenderer>> | null = null;

  return {
    async start(context: SessionContext) {
      store.status = {
        providerName: context.providerName,
        model: context.model,
        busy: false
      };
      store.decks = context.decks;
      store.loadStats = context.loadStats ?? null;

      cli = await createCliRenderer({ exitOnCtrlC: false });
      root = createRoot(cli);
      root.render(createElement(App, { store }));
    },

    prompt() {
      return store.awaitInput();
    },

    emit(event: RenderEvent) {
      switch (event.type) {
        case 'turn-start':
          store.status.busy = true;
          store.notify();
          break;
        case 'reasoning-start':
          store.startReasoning();
          break;
        case 'reasoning-delta':
          store.appendReasoning(event.text);
          break;
        case 'reasoning-end':
          store.endReasoning();
          break;
        case 'text-delta':
          store.appendAssistant(event.text);
          break;
        case 'tool-call':
          store.entries.push({ kind: 'tool', name: event.name, state: 'running' });
          store.notify();
          break;
        case 'tool-result':
          store.markTool(event.name, event.isError ? 'error' : 'ok');
          break;
        case 'turn-end':
          store.closeAssistant();
          store.status.busy = false;
          store.notify();
          break;
        case 'notice':
          store.notice = event.text;
          store.notify();
          break;
        case 'error':
          store.entries.push({ kind: 'error', text: event.text });
          store.notify();
          break;
      }
    },

    async stop(messages: readonly AgentMessage[]) {
      root?.unmount?.();
      root = null;
      cli?.destroy?.();
      cli = null;

      const text = transcriptToText(messages);
      if (text.trim()) {
        process.stdout.write('\n' + text + '\n');
      }
      if (options.showReasoning && store.reasoning.trim()) {
        process.stdout.write(`\n--- reasoning ---\n${store.reasoning.trim()}\n`);
      }
      process.stdout.write('\nSession ended.\n');
    }
  };
}
