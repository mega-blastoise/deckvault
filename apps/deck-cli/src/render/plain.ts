import * as readline from 'node:readline/promises';
import pc from 'picocolors';

import type { AgentMessage } from '../providers/types';
import type { RenderEvent, Renderer, SessionContext } from './types';

const INDICATOR = 'thinking…';

export interface PlainRendererOptions {
  readonly showReasoning: boolean;
}

export function createPlainRenderer(options: PlainRendererOptions): Renderer {
  let rl: readline.Interface | null = null;
  let indicatorShown = false;

  return {
    async start(context: SessionContext) {
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      console.log(
        '\n' + pc.dim(`Provider: ${context.providerName} · model: ${context.model}`)
      );
      console.log(pc.dim('Session ready. Type your question or "quit" to exit.') + '\n');
    },

    async prompt() {
      if (!rl) return null;
      let input: string;
      try {
        input = await rl.question(pc.cyan('› '));
      } catch {
        // stdin hit EOF (piped input or Ctrl-D) — readline is closed and any
        // further question() rejects. End the session instead of crashing.
        return null;
      }
      const trimmed = input.trim();
      if (trimmed === 'quit' || trimmed === 'exit') return null;
      return trimmed;
    },

    emit(event: RenderEvent) {
      switch (event.type) {
        case 'turn-start':
          process.stdout.write('\n');
          break;
        case 'reasoning-start':
          if (options.showReasoning) {
            process.stdout.write('\n' + pc.dim('▸ thinking…') + '\n');
          } else if (!indicatorShown) {
            process.stdout.write(pc.dim(INDICATOR));
            indicatorShown = true;
          }
          break;
        case 'reasoning-delta':
          if (options.showReasoning) process.stdout.write(pc.dim(event.text));
          break;
        case 'reasoning-end':
          if (options.showReasoning) {
            process.stdout.write('\n');
          } else if (indicatorShown) {
            process.stdout.write('\r' + ' '.repeat(INDICATOR.length) + '\r');
            indicatorShown = false;
          }
          break;
        case 'text-delta':
          process.stdout.write(event.text);
          break;
        case 'tool-call':
          process.stdout.write('\n' + pc.dim(`⏺ ${event.name}`) + '\n');
          break;
        case 'tool-result':
          break;
        case 'turn-end':
          process.stdout.write('\n');
          break;
        case 'notice':
          process.stderr.write(pc.yellow(event.text) + '\n');
          break;
        case 'error':
          process.stderr.write('\n' + pc.red(event.text) + '\n');
          break;
      }
    },

    async stop(_messages: readonly AgentMessage[]) {
      rl?.close();
      rl = null;
      console.log('\n' + pc.dim('Session ended.'));
    }
  };
}
