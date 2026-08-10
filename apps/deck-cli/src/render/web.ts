import type { AgentMessage } from '../providers/types';
import type { RenderEvent, Renderer, SessionContext } from './types';

/**
 * Streams RenderEvents to a browser as NDJSON — one JSON object per line.
 *
 * The agent loop is unchanged: this is simply a third Renderer alongside
 * `plain` and `tui`. The one asymmetry is `prompt()`. In a terminal it awaits
 * user input; here the input *is* the HTTP request, so it resolves once with
 * the posted message and returns null afterwards. That makes a request exactly
 * one turn, which in turn means the server holds no session state — the browser
 * keeps the conversation and replays it.
 */
export function createWebRenderer(message: string): {
  readonly renderer: Renderer;
  readonly stream: ReadableStream<Uint8Array>;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let consumed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    }
  });

  const write = (payload: unknown): void => {
    if (!controller) return;
    try {
      controller.enqueue(encoder.encode(JSON.stringify(payload) + '\n'));
    } catch {
      // Client disconnected mid-turn; the loop finishes and stop() closes.
    }
  };

  const renderer: Renderer = {
    async start(context: SessionContext) {
      write({ type: 'session', provider: context.providerName, model: context.model });
    },

    async prompt() {
      if (consumed) return null;
      consumed = true;
      return message;
    },

    emit(event: RenderEvent) {
      write(event);
    },

    async stop(messages: readonly AgentMessage[]) {
      // The browser owns history, so hand back the canonical turns it should
      // replay on the next request. Provider-specific `raw` rides along so the
      // adapter can echo it verbatim rather than rebuilding from text.
      write({ type: 'done', messages });
      controller?.close();
      controller = null;
    }
  };

  return { renderer, stream };
}
